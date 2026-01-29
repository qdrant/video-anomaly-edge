variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "video-anomaly"
}

variable "key_pair_name" {
  description = "Name of existing EC2 key pair for SSH access"
  type        = string
}

variable "gpu_instance_type" {
  description = "Instance type for GPU inference server"
  type        = string
  default     = "g5.xlarge"
}

variable "qdrant_instance_type" {
  description = "Instance type for Qdrant vector DB"
  type        = string
  default     = "t3.medium"
}

variable "allowed_ssh_cidr" {
  description = "CIDR block allowed to SSH into instances"
  type        = string
  default     = "0.0.0.0/0"
}
