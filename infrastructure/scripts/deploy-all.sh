#!/bin/bash
# ============================================================================
# EMR Integration Platform - Complete Deployment Script
# ============================================================================
# Purpose: Orchestrate full infrastructure and application deployment
# Usage: ./deploy-all.sh <environment> [--skip-infra] [--skip-services]
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-development}
SKIP_INFRA=false
SKIP_SERVICES=false
DRY_RUN=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --skip-infra)
            SKIP_INFRA=true
            ;;
        --skip-services)
            SKIP_SERVICES=true
            ;;
        --dry-run)
            DRY_RUN=true
            ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "${SCRIPT_DIR}")"
TERRAFORM_DIR="${PROJECT_ROOT}/terraform"
HELM_DIR="${PROJECT_ROOT}/helm"
NAMESPACE="emr-platform-${ENVIRONMENT}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}EMR Platform Deployment${NC}"
echo -e "${BLUE}Environment: ${ENVIRONMENT}${NC}"
echo -e "${BLUE}Namespace: ${NAMESPACE}${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Function to check prerequisites
check_prerequisites() {
    echo -e "${BLUE}Checking prerequisites...${NC}"

    local missing_tools=()

    # Check required tools
    command -v aws >/dev/null 2>&1 || missing_tools+=("aws-cli")
    command -v terraform >/dev/null 2>&1 || missing_tools+=("terraform")
    command -v kubectl >/dev/null 2>&1 || missing_tools+=("kubectl")
    command -v helm >/dev/null 2>&1 || missing_tools+=("helm")
    command -v jq >/dev/null 2>&1 || missing_tools+=("jq")

    if [ ${#missing_tools[@]} -ne 0 ]; then
        echo -e "${RED}✗ Missing required tools: ${missing_tools[*]}${NC}"
        exit 1
    fi

    # Check AWS credentials
    if ! aws sts get-caller-identity &>/dev/null; then
        echo -e "${RED}✗ AWS credentials not configured${NC}"
        exit 1
    fi

    echo -e "${GREEN}✓ All prerequisites met${NC}\n"
}

# Function to deploy infrastructure with Terraform
deploy_infrastructure() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}Deploying Infrastructure (Terraform)${NC}"
    echo -e "${BLUE}========================================${NC}\n"

    cd ${TERRAFORM_DIR}

    # Initialize Terraform
    echo -e "${BLUE}Initializing Terraform...${NC}"
    terraform init -upgrade

    # Select or create workspace
    echo -e "${BLUE}Selecting workspace: ${ENVIRONMENT}${NC}"
    terraform workspace select ${ENVIRONMENT} 2>/dev/null || terraform workspace new ${ENVIRONMENT}

    # Plan
    echo -e "${BLUE}Planning infrastructure changes...${NC}"
    terraform plan \
        -var="environment=${ENVIRONMENT}" \
        -var-file="environments/${ENVIRONMENT}.tfvars" \
        -out=tfplan

    if [ "$DRY_RUN" == "true" ]; then
        echo -e "${YELLOW}Dry run mode - skipping apply${NC}"
        return 0
    fi

    # Apply
    echo -e "${YELLOW}Applying infrastructure changes...${NC}"
    terraform apply tfplan

    # Export outputs
    echo -e "${BLUE}Exporting Terraform outputs...${NC}"
    terraform output -json > ${PROJECT_ROOT}/terraform-outputs.json

    echo -e "${GREEN}✓ Infrastructure deployed successfully${NC}\n"

    cd - > /dev/null
}

# Function to configure kubectl
configure_kubectl() {
    echo -e "${BLUE}Configuring kubectl...${NC}"

    CLUSTER_NAME=$(jq -r '.eks_cluster_name.value' ${PROJECT_ROOT}/terraform-outputs.json)
    AWS_REGION=$(jq -r '.aws_region.value' ${PROJECT_ROOT}/terraform-outputs.json)

    aws eks update-kubeconfig \
        --name ${CLUSTER_NAME} \
        --region ${AWS_REGION}

    echo -e "${GREEN}✓ kubectl configured${NC}\n"
}

# Function to create namespace
create_namespace() {
    echo -e "${BLUE}Creating namespace: ${NAMESPACE}${NC}"

    kubectl create namespace ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -

    # Label namespace
    kubectl label namespace ${NAMESPACE} \
        environment=${ENVIRONMENT} \
        managed-by=terraform \
        --overwrite

    echo -e "${GREEN}✓ Namespace created${NC}\n"
}

# Function to deploy secrets
deploy_secrets() {
    echo -e "${BLUE}Deploying secrets...${NC}"

    # Get secret values from AWS Secrets Manager and create Kubernetes secrets

    # RDS credentials
    RDS_SECRET=$(aws secretsmanager get-secret-value \
        --secret-id "emr-platform-${ENVIRONMENT}/rds/master-credentials" \
        --query SecretString \
        --output text)

    kubectl create secret generic rds-credentials \
        --from-literal=connection_string=$(echo $RDS_SECRET | jq -r '.connection_string') \
        --namespace=${NAMESPACE} \
        --dry-run=client -o yaml | kubectl apply -f -

    # Redis credentials
    REDIS_SECRET=$(aws secretsmanager get-secret-value \
        --secret-id "emr-platform-${ENVIRONMENT}/redis/auth-token" \
        --query SecretString \
        --output text)

    kubectl create secret generic redis-auth-token \
        --from-literal=auth_token=$(echo $REDIS_SECRET | jq -r '.auth_token') \
        --from-literal=connection_string=$(echo $REDIS_SECRET | jq -r '.connection_string') \
        --namespace=${NAMESPACE} \
        --dry-run=client -o yaml | kubectl apply -f -

    # MSK credentials
    MSK_BROKERS=$(jq -r '.msk_bootstrap_brokers_sasl_iam.value' ${PROJECT_ROOT}/terraform-outputs.json)

    kubectl create secret generic msk-credentials \
        --from-literal=bootstrap_servers=${MSK_BROKERS} \
        --namespace=${NAMESPACE} \
        --dry-run=client -o yaml | kubectl apply -f -

    echo -e "${GREEN}✓ Secrets deployed${NC}\n"
}

# Function to deploy Helm charts
deploy_services() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}Deploying Services (Helm)${NC}"
    echo -e "${BLUE}========================================${NC}\n"

    local services=("api-gateway" "task-service" "emr-service" "sync-service" "handover-service")

    for service in "${services[@]}"; do
        echo -e "${BLUE}Deploying ${service}...${NC}"

        helm upgrade --install ${service} ${HELM_DIR}/${service} \
            --namespace=${NAMESPACE} \
            --create-namespace \
            --values=${HELM_DIR}/${service}/values.yaml \
            --values=${HELM_DIR}/${service}/values-${ENVIRONMENT}.yaml \
            --set image.tag=${IMAGE_TAG:-latest} \
            --wait \
            --timeout=10m

        echo -e "${GREEN}✓ ${service} deployed${NC}\n"
    done
}

# Function to run post-deployment checks
post_deployment_checks() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}Post-Deployment Checks${NC}"
    echo -e "${BLUE}========================================${NC}\n"

    # Monitor deployment
    echo -e "${BLUE}Monitoring deployment progress...${NC}"
    ${SCRIPT_DIR}/monitor-deployment.sh ${ENVIRONMENT} ${NAMESPACE}

    # Run smoke tests
    echo -e "\n${BLUE}Running smoke tests...${NC}"
    if ${SCRIPT_DIR}/smoke-tests.sh ${ENVIRONMENT} ${NAMESPACE}; then
        echo -e "${GREEN}✓ All smoke tests passed${NC}\n"
    else
        echo -e "${RED}✗ Smoke tests failed${NC}"
        echo -e "${YELLOW}Consider rolling back the deployment${NC}\n"
        return 1
    fi
}

# Function to display deployment summary
display_summary() {
    echo -e "\n${GREEN}========================================${NC}"
    echo -e "${GREEN}Deployment Summary${NC}"
    echo -e "${GREEN}========================================${NC}\n"

    # Cluster info
    CLUSTER_NAME=$(jq -r '.eks_cluster_name.value' ${PROJECT_ROOT}/terraform-outputs.json)
    echo -e "${BLUE}EKS Cluster:${NC} ${CLUSTER_NAME}"

    # Service endpoints
    echo -e "\n${BLUE}Service Endpoints:${NC}"
    kubectl get ingress -n ${NAMESPACE} -o custom-columns=NAME:.metadata.name,HOSTS:.spec.rules[*].host,ADDRESS:.status.loadBalancer.ingress[*].hostname --no-headers

    # Pod status
    echo -e "\n${BLUE}Pod Status:${NC}"
    kubectl get pods -n ${NAMESPACE}

    # Database info
    echo -e "\n${BLUE}Database:${NC}"
    RDS_ENDPOINT=$(jq -r '.rds_endpoint.value' ${PROJECT_ROOT}/terraform-outputs.json)
    echo -e "  Endpoint: ${RDS_ENDPOINT}"

    # Redis info
    echo -e "\n${BLUE}Redis:${NC}"
    REDIS_ENDPOINT=$(jq -r '.redis_configuration_endpoint.value' ${PROJECT_ROOT}/terraform-outputs.json)
    echo -e "  Endpoint: ${REDIS_ENDPOINT}"

    # Kafka info
    echo -e "\n${BLUE}Kafka (MSK):${NC}"
    MSK_BROKERS=$(jq -r '.msk_bootstrap_brokers_sasl_iam.value' ${PROJECT_ROOT}/terraform-outputs.json)
    echo -e "  Brokers: ${MSK_BROKERS}"

    echo -e "\n${GREEN}========================================${NC}"
    echo -e "${GREEN}Deployment completed successfully!${NC}"
    echo -e "${GREEN}========================================${NC}\n"
}

# Main execution
main() {
    check_prerequisites

    # Deploy infrastructure
    if [ "$SKIP_INFRA" != "true" ]; then
        deploy_infrastructure
        configure_kubectl
        create_namespace
        deploy_secrets
    else
        echo -e "${YELLOW}Skipping infrastructure deployment${NC}\n"
    fi

    # Deploy services
    if [ "$SKIP_SERVICES" != "true" ]; then
        deploy_services
        post_deployment_checks
    else
        echo -e "${YELLOW}Skipping service deployment${NC}\n"
    fi

    # Display summary
    display_summary
}

# Run main function
main

exit 0
