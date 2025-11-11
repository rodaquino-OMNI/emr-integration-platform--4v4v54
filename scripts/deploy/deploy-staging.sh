#!/bin/bash

set -euo pipefail

# Staging Deployment Script for EMRTask Platform
# This script orchestrates the complete deployment of the EMRTask platform to staging

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENVIRONMENT="staging"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-}"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    local required_tools=("aws" "kubectl" "helm" "terraform" "docker" "jq")
    local missing_tools=()

    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            missing_tools+=("$tool")
        fi
    done

    if [ ${#missing_tools[@]} -ne 0 ]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        exit 1
    fi

    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS credentials not configured"
        exit 1
    fi

    # Get AWS Account ID
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    log_success "Prerequisites check passed. AWS Account: ${AWS_ACCOUNT_ID}"
}

# Deploy infrastructure with Terraform
deploy_infrastructure() {
    log_info "Deploying infrastructure with Terraform..."

    cd "${PROJECT_ROOT}/infrastructure/terraform/environments/${ENVIRONMENT}"

    # Initialize Terraform
    log_info "Initializing Terraform..."
    terraform init

    # Validate configuration
    log_info "Validating Terraform configuration..."
    terraform validate

    # Plan deployment
    log_info "Planning infrastructure deployment..."
    terraform plan -out=tfplan

    # Apply deployment
    log_info "Applying infrastructure deployment..."
    terraform apply -auto-approve tfplan

    # Export outputs
    log_info "Exporting Terraform outputs..."
    terraform output -json > "${PROJECT_ROOT}/terraform-outputs.json"

    log_success "Infrastructure deployment completed"
}

# Configure kubectl
configure_kubectl() {
    log_info "Configuring kubectl for EKS cluster..."

    local cluster_name="emrtask-staging"

    # Update kubeconfig
    aws eks update-kubeconfig \
        --region "${AWS_REGION}" \
        --name "${cluster_name}"

    # Verify cluster connection
    if kubectl cluster-info &> /dev/null; then
        log_success "Successfully connected to EKS cluster: ${cluster_name}"
    else
        log_error "Failed to connect to EKS cluster"
        exit 1
    fi
}

# Build and push Docker images
build_and_push_images() {
    log_info "Building and pushing Docker images..."

    local ecr_registry="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
    local image_tag="${IMAGE_TAG:-$(git rev-parse --short HEAD)}"

    # Login to ECR
    log_info "Logging into ECR..."
    aws ecr get-login-password --region "${AWS_REGION}" | \
        docker login --username AWS --password-stdin "${ecr_registry}"

    # Create ECR repositories if they don't exist
    local services=("api-gateway" "emr-service" "handover-service" "sync-service" "task-service")

    for service in "${services[@]}"; do
        log_info "Creating ECR repository for ${service}..."
        aws ecr create-repository \
            --repository-name "emrtask/${service}" \
            --region "${AWS_REGION}" \
            --image-scanning-configuration scanOnPush=true \
            --encryption-configuration encryptionType=AES256 \
            2>/dev/null || log_warning "Repository emrtask/${service} may already exist"
    done

    # Build and push images
    cd "${PROJECT_ROOT}/src/backend"

    for service in "${services[@]}"; do
        log_info "Building Docker image for ${service}..."

        docker build \
            --target production \
            --build-arg SERVICE_NAME="${service}" \
            --tag "${ecr_registry}/emrtask/${service}:${image_tag}" \
            --tag "${ecr_registry}/emrtask/${service}:latest" \
            -f Dockerfile \
            .

        log_info "Pushing Docker image for ${service}..."
        docker push "${ecr_registry}/emrtask/${service}:${image_tag}"
        docker push "${ecr_registry}/emrtask/${service}:latest"

        log_success "Image pushed: ${ecr_registry}/emrtask/${service}:${image_tag}"
    done

    # Export image tag for Kubernetes deployment
    export IMAGE_TAG="${image_tag}"
    echo "${image_tag}" > "${PROJECT_ROOT}/.image-tag"

    log_success "All Docker images built and pushed successfully"
}

# Deploy Kubernetes resources
deploy_kubernetes() {
    log_info "Deploying Kubernetes resources..."

    local k8s_dir="${PROJECT_ROOT}/infrastructure/kubernetes/${ENVIRONMENT}"
    local image_tag="${IMAGE_TAG:-$(cat "${PROJECT_ROOT}/.image-tag" 2>/dev/null || echo 'latest')}"

    # Create namespace
    log_info "Creating namespace..."
    kubectl apply -f "${k8s_dir}/namespace.yaml"

    # Create RBAC resources
    log_info "Creating RBAC resources..."
    envsubst < "${k8s_dir}/rbac.yaml" | kubectl apply -f -

    # Create ConfigMaps
    log_info "Creating ConfigMaps..."
    kubectl apply -f "${k8s_dir}/configmap.yaml"

    # Create Secrets (from AWS Secrets Manager via External Secrets Operator)
    log_info "Creating Secrets..."
    envsubst < "${k8s_dir}/secrets.yaml" | kubectl apply -f -

    # Wait for External Secrets to be synced
    log_info "Waiting for secrets to be synced..."
    sleep 10

    # Deploy services
    local services=("api-gateway" "emr-service" "handover-service" "sync-service" "task-service")

    for service in "${services[@]}"; do
        log_info "Deploying ${service}..."

        # Replace environment variables in deployment manifests
        export AWS_ACCOUNT_ID IMAGE_TAG="${image_tag}"
        envsubst < "${k8s_dir}/${service}-deployment.yaml" | kubectl apply -f -

        log_success "${service} deployed"
    done

    log_success "Kubernetes resources deployed successfully"
}

# Wait for deployments to be ready
wait_for_deployments() {
    log_info "Waiting for deployments to be ready..."

    local services=("api-gateway" "emr-service" "handover-service" "sync-service" "task-service")
    local timeout=300  # 5 minutes

    for service in "${services[@]}"; do
        log_info "Waiting for ${service} to be ready..."

        if kubectl wait --for=condition=available \
            --timeout="${timeout}s" \
            deployment/"${service}" \
            -n emrtask-staging; then
            log_success "${service} is ready"
        else
            log_error "${service} failed to become ready within ${timeout}s"
            return 1
        fi
    done

    log_success "All deployments are ready"
}

# Run smoke tests
run_smoke_tests() {
    log_info "Running smoke tests..."

    if [ -f "${SCRIPT_DIR}/smoke-test-staging.sh" ]; then
        bash "${SCRIPT_DIR}/smoke-test-staging.sh"
    else
        log_warning "Smoke test script not found, skipping..."
    fi
}

# Display deployment information
display_deployment_info() {
    log_info "Deployment Information:"
    echo ""
    echo "Environment: ${ENVIRONMENT}"
    echo "AWS Region: ${AWS_REGION}"
    echo "AWS Account: ${AWS_ACCOUNT_ID}"
    echo "Image Tag: ${IMAGE_TAG:-$(cat "${PROJECT_ROOT}/.image-tag" 2>/dev/null || echo 'latest')}"
    echo ""

    log_info "Service Endpoints:"
    kubectl get svc -n emrtask-staging

    echo ""
    log_info "Pod Status:"
    kubectl get pods -n emrtask-staging

    echo ""
    log_info "API Gateway LoadBalancer URL:"
    kubectl get svc api-gateway -n emrtask-staging -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
    echo ""
}

# Main deployment function
main() {
    log_info "Starting EMRTask Platform Staging Deployment"
    log_info "=============================================="

    check_prerequisites
    deploy_infrastructure
    configure_kubectl
    build_and_push_images
    deploy_kubernetes
    wait_for_deployments
    run_smoke_tests
    display_deployment_info

    log_success "Staging deployment completed successfully!"
}

# Execute main function
main "$@"
