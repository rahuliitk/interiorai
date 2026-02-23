##############################################################################
# OpenLintel — Terraform Variables
##############################################################################

# ============================================================================
# General
# ============================================================================

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
  default     = "staging"

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be 'staging' or 'production'."
  }
}

variable "domain" {
  description = "Root domain for the application"
  type        = string
  default     = "openlintel.io"
}

# ============================================================================
# Networking
# ============================================================================

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

# ============================================================================
# Database
# ============================================================================

variable "db_instance_class" {
  description = "RDS instance class for PostgreSQL"
  type        = string
  default     = "db.t4g.medium"
}

variable "db_allocated_storage" {
  description = "Initial allocated storage in GB for RDS"
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  description = "Maximum allocated storage in GB for RDS autoscaling"
  type        = number
  default     = 100
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "openlintel"
}

variable "db_username" {
  description = "PostgreSQL master username"
  type        = string
  default     = "openlintel"
  sensitive   = true
}

variable "db_password" {
  description = "PostgreSQL master password"
  type        = string
  sensitive   = true
}

# ============================================================================
# Storage
# ============================================================================

variable "s3_bucket_name" {
  description = "S3 bucket name for file storage"
  type        = string
  default     = "openlintel-uploads"
}

variable "s3_force_destroy" {
  description = "Allow S3 bucket to be destroyed even if it contains objects"
  type        = bool
  default     = false
}

# ============================================================================
# Compute / EKS
# ============================================================================

variable "eks_cluster_version" {
  description = "Kubernetes version for EKS cluster"
  type        = string
  default     = "1.29"
}

variable "eks_general_instance_types" {
  description = "Instance types for general-purpose EKS node group"
  type        = list(string)
  default     = ["t3.large", "t3.xlarge"]
}

variable "eks_general_min_size" {
  description = "Minimum number of nodes in general node group"
  type        = number
  default     = 2
}

variable "eks_general_max_size" {
  description = "Maximum number of nodes in general node group"
  type        = number
  default     = 8
}

variable "eks_general_desired_size" {
  description = "Desired number of nodes in general node group"
  type        = number
  default     = 3
}

variable "eks_gpu_instance_types" {
  description = "Instance types for GPU EKS node group (for design engine)"
  type        = list(string)
  default     = ["g4dn.xlarge"]
}

variable "eks_gpu_min_size" {
  description = "Minimum number of nodes in GPU node group"
  type        = number
  default     = 0
}

variable "eks_gpu_max_size" {
  description = "Maximum number of nodes in GPU node group"
  type        = number
  default     = 2
}

variable "eks_gpu_desired_size" {
  description = "Desired number of nodes in GPU node group"
  type        = number
  default     = 0
}
