##############################################################################
# OpenLintel — Storage (S3 Bucket + IAM)
##############################################################################

# ============================================================================
# S3 Bucket for File Storage (uploads, renders, exports)
# ============================================================================

resource "aws_s3_bucket" "uploads" {
  bucket        = "${var.s3_bucket_name}-${var.environment}"
  force_destroy = var.s3_force_destroy

  tags = {
    Name = "${local.name}-uploads"
  }
}

# Versioning
resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

# Block public access
resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle rules
resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    id     = "transition-to-ia"
    status = "Enabled"

    filter {
      prefix = "uploads/"
    }

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 365
      storage_class = "GLACIER"
    }
  }

  rule {
    id     = "cleanup-temp"
    status = "Enabled"

    filter {
      prefix = "temp/"
    }

    expiration {
      days = 7
    }
  }

  rule {
    id     = "cleanup-incomplete-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 3
    }
  }
}

# CORS configuration (for direct browser uploads)
resource "aws_s3_bucket_cors_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST"]
    allowed_origins = [
      "https://app.${var.domain}",
      "https://${var.domain}",
    ]
    expose_headers  = ["ETag", "x-amz-request-id"]
    max_age_seconds = 3600
  }
}

# ============================================================================
# IAM Policy for S3 Access (to be attached to EKS pod service accounts)
# ============================================================================

resource "aws_iam_policy" "s3_access" {
  name_prefix = "${local.name}-s3-access-"
  description = "Allow OpenLintel services to access S3 uploads bucket"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ListBucket"
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:GetBucketLocation",
        ]
        Resource = aws_s3_bucket.uploads.arn
      },
      {
        Sid    = "ReadWriteObjects"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:GetObjectVersion",
        ]
        Resource = "${aws_s3_bucket.uploads.arn}/*"
      },
    ]
  })

  tags = {
    Name = "${local.name}-s3-access-policy"
  }
}

# IAM Role for S3 access (IRSA — IAM Roles for Service Accounts)
resource "aws_iam_role" "s3_access" {
  name_prefix = "${local.name}-s3-access-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_eks_cluster.main.identity[0].oidc[0].issuer
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "${replace(aws_eks_cluster.main.identity[0].oidc[0].issuer, "https://", "")}:sub" = "system:serviceaccount:openlintel:openlintel-sa"
          }
        }
      }
    ]
  })

  tags = {
    Name = "${local.name}-s3-access-role"
  }
}

resource "aws_iam_role_policy_attachment" "s3_access" {
  role       = aws_iam_role.s3_access.name
  policy_arn = aws_iam_policy.s3_access.arn
}
