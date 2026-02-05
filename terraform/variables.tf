variable "aws_profile" {
  description = "AWS profile to use"
  type        = string
  default     = "personal"
}

variable "aws_region" {
  description = "AWS region (must be us-east-1 for CloudFront)"
  type        = string
  default     = "us-east-1"
}

variable "root_domain" {
  description = "Root domain for the site"
  type        = string
  default     = "rmzi.world"
}

variable "subdomain" {
  description = "Subdomain for the 36247 site"
  type        = string
  default     = "36247"
}

variable "cookie_ttl_hours" {
  description = "TTL for signed cookies in hours"
  type        = number
  default     = 24
}

locals {
  domain_name    = "${var.subdomain}.${var.root_domain}"
  site_bucket    = "${var.subdomain}-site.${var.root_domain}"
  tracks_bucket  = "${var.subdomain}-tracks.${var.root_domain}"
}
