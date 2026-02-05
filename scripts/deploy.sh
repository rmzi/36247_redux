#!/bin/bash
#
# 36247 Deploy Script
# Deploys infrastructure and syncs frontend to S3
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Configuration
AWS_PROFILE="${AWS_PROFILE:-personal}"
AWS_REGION="${AWS_REGION:-us-east-1}"
SITE_BUCKET="36247-site.rmzi.world"
CLOUDFRONT_DISTRIBUTION_ID=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check required tools
check_requirements() {
    local missing=0

    if ! command -v terraform &> /dev/null; then
        log_error "terraform is not installed"
        missing=1
    fi

    if ! command -v aws &> /dev/null; then
        log_error "aws CLI is not installed"
        missing=1
    fi

    if [ $missing -eq 1 ]; then
        exit 1
    fi
}

# Deploy Terraform infrastructure
deploy_terraform() {
    log_info "Deploying Terraform infrastructure..."

    cd "$PROJECT_ROOT/terraform"

    # Initialize if needed
    if [ ! -d ".terraform" ]; then
        log_info "Initializing Terraform..."
        terraform init
    fi

    # Plan and apply
    log_info "Running terraform plan..."
    terraform plan -out=tfplan

    read -p "Apply changes? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Applying Terraform changes..."
        terraform apply tfplan
        rm -f tfplan

        # Get CloudFront distribution ID from outputs
        CLOUDFRONT_DISTRIBUTION_ID=$(terraform output -raw cloudfront_distribution_id 2>/dev/null || true)
    else
        log_warn "Terraform apply skipped"
        rm -f tfplan
    fi

    cd "$PROJECT_ROOT"
}

# Sync frontend to S3
sync_frontend() {
    log_info "Syncing frontend to S3..."

    # Get CloudFront distribution ID if not already set
    if [ -z "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
        cd "$PROJECT_ROOT/terraform"
        CLOUDFRONT_DISTRIBUTION_ID=$(terraform output -raw cloudfront_distribution_id 2>/dev/null || true)
        cd "$PROJECT_ROOT"
    fi

    # Sync www/ to site bucket
    aws s3 sync "$PROJECT_ROOT/www/" "s3://$SITE_BUCKET/" \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --delete \
        --cache-control "max-age=3600" \
        --exclude ".DS_Store" \
        --exclude "*.map"

    # Set specific cache headers for different file types
    log_info "Setting cache headers..."

    # HTML files - short cache
    aws s3 cp "s3://$SITE_BUCKET/" "s3://$SITE_BUCKET/" \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --recursive \
        --exclude "*" \
        --include "*.html" \
        --metadata-directive REPLACE \
        --cache-control "max-age=300" \
        --content-type "text/html"

    # CSS files - medium cache
    aws s3 cp "s3://$SITE_BUCKET/" "s3://$SITE_BUCKET/" \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --recursive \
        --exclude "*" \
        --include "*.css" \
        --metadata-directive REPLACE \
        --cache-control "max-age=86400" \
        --content-type "text/css"

    # JS files - medium cache
    aws s3 cp "s3://$SITE_BUCKET/" "s3://$SITE_BUCKET/" \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --recursive \
        --exclude "*" \
        --include "*.js" \
        --metadata-directive REPLACE \
        --cache-control "max-age=86400" \
        --content-type "application/javascript"

    log_info "Frontend synced to s3://$SITE_BUCKET/"
}

# Invalidate CloudFront cache
invalidate_cache() {
    if [ -n "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
        log_info "Invalidating CloudFront cache..."

        aws cloudfront create-invalidation \
            --profile "$AWS_PROFILE" \
            --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
            --paths "/*" \
            --query 'Invalidation.Id' \
            --output text

        log_info "CloudFront invalidation created"
    else
        log_warn "CloudFront distribution ID not found, skipping invalidation"
    fi
}

# Generate signed cookies for testing
generate_test_cookies() {
    log_info "To generate signed cookies for testing, use the cookie generator script"
    log_info "or embed pre-signed cookies in the frontend during deployment"
}

# Show usage
usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  all         Deploy infrastructure and sync frontend (default)"
    echo "  infra       Deploy Terraform infrastructure only"
    echo "  frontend    Sync frontend to S3 only"
    echo "  invalidate  Invalidate CloudFront cache only"
    echo "  help        Show this help message"
    echo ""
    echo "Environment variables:"
    echo "  AWS_PROFILE   AWS profile to use (default: personal)"
    echo "  AWS_REGION    AWS region (default: us-east-1)"
}

# Main
main() {
    check_requirements

    local command="${1:-all}"

    case "$command" in
        all)
            deploy_terraform
            sync_frontend
            invalidate_cache
            log_info "Deployment complete!"
            ;;
        infra)
            deploy_terraform
            log_info "Infrastructure deployment complete!"
            ;;
        frontend)
            sync_frontend
            invalidate_cache
            log_info "Frontend deployment complete!"
            ;;
        invalidate)
            # Need to get distribution ID from terraform
            cd "$PROJECT_ROOT/terraform"
            CLOUDFRONT_DISTRIBUTION_ID=$(terraform output -raw cloudfront_distribution_id 2>/dev/null || true)
            cd "$PROJECT_ROOT"
            invalidate_cache
            ;;
        help|--help|-h)
            usage
            ;;
        *)
            log_error "Unknown command: $command"
            usage
            exit 1
            ;;
    esac
}

main "$@"
