#!/bin/bash
# EMR Integration Platform - TLS Configuration Verification Script
# Version: 1.0.0
# Purpose: Verify TLS 1.3 configuration across all services

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPORT_DIR="$PROJECT_ROOT/security-reports/tls-verification"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$REPORT_DIR"

echo -e "${GREEN}=== TLS Configuration Verification ===${NC}"
echo "Starting verification at $(date)"

REPORT_FILE="$REPORT_DIR/tls-verification-${TIMESTAMP}.txt"

{
    echo "EMR Integration Platform - TLS Configuration Report"
    echo "Generated: $(date)"
    echo "===================================================="
    echo ""

    # 1. Check Istio Gateway Configuration
    echo "1. Istio Gateway Configuration"
    echo "==============================="

    ISTIO_GATEWAY="$PROJECT_ROOT/src/backend/k8s/config/istio-gateway.yaml"

    if [ -f "$ISTIO_GATEWAY" ]; then
        echo "File: $ISTIO_GATEWAY"

        TLS_VERSION=$(grep "minProtocolVersion:" "$ISTIO_GATEWAY" | awk '{print $2}')
        echo "  Configured TLS Version: $TLS_VERSION"

        if [ "$TLS_VERSION" = "TLSV1_3" ]; then
            echo -e "  ${GREEN}✓ TLS 1.3 correctly configured${NC}"
            ISTIO_TLS_OK=true
        elif [ "$TLS_VERSION" = "TLSV1_2" ]; then
            echo -e "  ${RED}✗ TLS 1.2 detected - UPGRADE REQUIRED to TLS 1.3${NC}"
            echo "  Security Policy Requirement: TLS 1.3 minimum"
            ISTIO_TLS_OK=false
        else
            echo -e "  ${RED}✗ Unknown or missing TLS version${NC}"
            ISTIO_TLS_OK=false
        fi

        echo ""
        echo "  Cipher Suites:"
        grep -A 5 "cipherSuites:" "$ISTIO_GATEWAY" | grep -v "cipherSuites:" || echo "    No cipher suites specified"

    else
        echo -e "  ${RED}✗ Istio Gateway configuration not found${NC}"
        ISTIO_TLS_OK=false
    fi

    echo ""
    echo ""

    # 2. Check PostgreSQL SSL Configuration
    echo "2. PostgreSQL SSL Configuration"
    echo "==============================="

    PG_SECRETS="$PROJECT_ROOT/src/backend/k8s/secrets/postgres-secrets.yaml"

    if [ -f "$PG_SECRETS" ]; then
        echo "File: $PG_SECRETS"

        SSL_MODE=$(grep "POSTGRES_SSL_MODE:" "$PG_SECRETS" | awk '{print $2}')
        if [ -n "$SSL_MODE" ]; then
            SSL_MODE_DECODED=$(echo "$SSL_MODE" | base64 -d 2>/dev/null || echo "")
            echo "  SSL Mode: $SSL_MODE_DECODED"

            if [ "$SSL_MODE_DECODED" = "verify-full" ] || [ "$SSL_MODE_DECODED" = "require" ]; then
                echo -e "  ${GREEN}✓ SSL properly configured${NC}"
                PG_SSL_OK=true
            else
                echo -e "  ${RED}✗ SSL mode should be 'verify-full' or 'require'${NC}"
                PG_SSL_OK=false
            fi
        else
            echo -e "  ${YELLOW}⚠ SSL mode not specified${NC}"
            PG_SSL_OK=false
        fi

        # Check for SSL certificates
        if grep -q "POSTGRES_SSL_CERT:" "$PG_SECRETS"; then
            echo -e "  ${GREEN}✓ SSL certificates configured${NC}"
        else
            echo -e "  ${YELLOW}⚠ SSL certificates not found${NC}"
        fi
    else
        echo -e "  ${RED}✗ PostgreSQL secrets not found${NC}"
        PG_SSL_OK=false
    fi

    echo ""
    echo ""

    # 3. Check Redis TLS Configuration
    echo "3. Redis TLS Configuration"
    echo "==========================="

    REDIS_CONFIG="$PROJECT_ROOT/src/backend/k8s/config/redis-config.yaml"

    if [ -f "$REDIS_CONFIG" ]; then
        echo "File: $REDIS_CONFIG"

        if grep -q "tls-port" "$REDIS_CONFIG"; then
            echo -e "  ${GREEN}✓ TLS port configured${NC}"
            REDIS_TLS_OK=true
        else
            echo -e "  ${YELLOW}⚠ TLS port not configured${NC}"
            REDIS_TLS_OK=false
        fi

        if grep -q "tls-cert-file" "$REDIS_CONFIG" && grep -q "tls-key-file" "$REDIS_CONFIG"; then
            echo -e "  ${GREEN}✓ TLS certificates configured${NC}"
        else
            echo -e "  ${YELLOW}⚠ TLS certificates not configured${NC}"
            REDIS_TLS_OK=false
        fi
    else
        echo "  ${YELLOW}⚠ Redis configuration not found - checking docker-compose${NC}"

        DOCKER_COMPOSE="$PROJECT_ROOT/src/backend/docker-compose.yml"
        if grep -q "redis-server.*--tls" "$DOCKER_COMPOSE" 2>/dev/null; then
            echo -e "  ${GREEN}✓ TLS enabled in docker-compose${NC}"
            REDIS_TLS_OK=true
        else
            echo -e "  ${YELLOW}⚠ TLS not enabled in docker-compose${NC}"
            REDIS_TLS_OK=false
        fi
    fi

    echo ""
    echo ""

    # 4. Check Kafka SSL Configuration
    echo "4. Kafka SSL Configuration"
    echo "=========================="

    KAFKA_CONFIG="$PROJECT_ROOT/src/backend/k8s/config/kafka-config.yaml"
    DOCKER_COMPOSE="$PROJECT_ROOT/src/backend/docker-compose.yml"

    if grep -q "SSL://" "$DOCKER_COMPOSE" 2>/dev/null; then
        echo -e "  ${GREEN}✓ Kafka SSL listener configured${NC}"
        KAFKA_SSL_OK=true
    elif grep -q "PLAINTEXT://" "$DOCKER_COMPOSE" 2>/dev/null; then
        echo -e "  ${RED}✗ Kafka using PLAINTEXT (unencrypted) - SSL required for production${NC}"
        KAFKA_SSL_OK=false
    else
        echo -e "  ${YELLOW}⚠ Kafka SSL configuration unclear${NC}"
        KAFKA_SSL_OK=false
    fi

    echo ""
    echo ""

    # 5. Check Application TLS Configuration
    echo "5. Application Service TLS"
    echo "==========================="

    # Check backend services
    for SERVICE in api-gateway task-service emr-service; do
        SERVICE_CONFIG="$PROJECT_ROOT/src/backend/packages/$SERVICE/src/config/index.ts"

        if [ -f "$SERVICE_CONFIG" ]; then
            echo "  $SERVICE:"

            if grep -q "https" "$SERVICE_CONFIG"; then
                echo -e "    ${GREEN}✓ HTTPS configuration found${NC}"
            else
                echo -e "    ${YELLOW}⚠ HTTPS configuration not explicit${NC}"
            fi
        fi
    done

    echo ""
    echo ""

    # 6. Check EMR Integration TLS
    echo "6. EMR Integration TLS"
    echo "======================"

    HL7_CONFIG="$PROJECT_ROOT/src/backend/packages/emr-service/src/config/hl7.config.ts"

    if [ -f "$HL7_CONFIG" ]; then
        echo "File: hl7.config.ts"

        if grep -q "tls.*true" "$HL7_CONFIG"; then
            echo -e "  ${GREEN}✓ HL7 TLS enabled${NC}"
            HL7_TLS_OK=true
        else
            echo -e "  ${YELLOW}⚠ HL7 TLS configuration unclear${NC}"
            HL7_TLS_OK=false
        fi

        # Check for certificate paths
        if grep -q "certPath" "$HL7_CONFIG" || grep -q "cert.*:" "$HL7_CONFIG"; then
            echo -e "  ${GREEN}✓ TLS certificate paths configured${NC}"
        else
            echo -e "  ${YELLOW}⚠ TLS certificate paths not found${NC}"
        fi
    fi

    echo ""
    echo ""

    # Summary
    echo "===================================================="
    echo "VERIFICATION SUMMARY"
    echo "===================================================="
    echo ""

    PASS_COUNT=0
    FAIL_COUNT=0
    WARN_COUNT=0

    if [ "${ISTIO_TLS_OK:-false}" = "true" ]; then
        echo -e "${GREEN}✓ Istio Gateway: TLS 1.3 configured${NC}"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo -e "${RED}✗ Istio Gateway: TLS 1.3 NOT configured${NC}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi

    if [ "${PG_SSL_OK:-false}" = "true" ]; then
        echo -e "${GREEN}✓ PostgreSQL: SSL properly configured${NC}"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo -e "${YELLOW}⚠ PostgreSQL: SSL configuration needs review${NC}"
        WARN_COUNT=$((WARN_COUNT + 1))
    fi

    if [ "${REDIS_TLS_OK:-false}" = "true" ]; then
        echo -e "${GREEN}✓ Redis: TLS configured${NC}"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo -e "${YELLOW}⚠ Redis: TLS not configured${NC}"
        WARN_COUNT=$((WARN_COUNT + 1))
    fi

    if [ "${KAFKA_SSL_OK:-false}" = "true" ]; then
        echo -e "${GREEN}✓ Kafka: SSL configured${NC}"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo -e "${RED}✗ Kafka: SSL NOT configured (PLAINTEXT)${NC}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi

    if [ "${HL7_TLS_OK:-false}" = "true" ]; then
        echo -e "${GREEN}✓ HL7: TLS configured${NC}"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo -e "${YELLOW}⚠ HL7: TLS configuration unclear${NC}"
        WARN_COUNT=$((WARN_COUNT + 1))
    fi

    echo ""
    echo "Results: $PASS_COUNT passed, $FAIL_COUNT failed, $WARN_COUNT warnings"
    echo ""

    if [ $FAIL_COUNT -gt 0 ]; then
        echo "===================================================="
        echo "CRITICAL ACTIONS REQUIRED:"
        echo "===================================================="
        echo ""

        if [ "${ISTIO_TLS_OK:-false}" != "true" ]; then
            echo "1. Update Istio Gateway to TLS 1.3:"
            echo "   File: src/backend/k8s/config/istio-gateway.yaml"
            echo "   Change: minProtocolVersion: TLSV1_3"
            echo ""
        fi

        if [ "${KAFKA_SSL_OK:-false}" != "true" ]; then
            echo "2. Enable Kafka SSL:"
            echo "   File: src/backend/docker-compose.yml"
            echo "   Change: KAFKA_ADVERTISED_LISTENERS=SSL://kafka:9093"
            echo "   Add SSL configuration"
            echo ""
        fi

        echo "3. Review all TLS configurations before production deployment"
        echo "4. Ensure all certificates are valid and not self-signed for production"
        echo "5. Implement certificate rotation policies (90-day maximum)"
    fi

} | tee "$REPORT_FILE"

echo -e "\n${GREEN}=== TLS Verification Complete ===${NC}"
echo "Report saved to: $REPORT_FILE"

# Determine exit code
if [ $FAIL_COUNT -gt 0 ]; then
    echo -e "\n${RED}FAIL: Critical TLS configuration issues found${NC}"
    exit 1
elif [ $WARN_COUNT -gt 0 ]; then
    echo -e "\n${YELLOW}WARNING: TLS configuration needs attention${NC}"
    exit 1
else
    echo -e "\n${GREEN}PASS: TLS configuration meets security requirements${NC}"
    exit 0
fi
