output "gpu_instance_ip" {
  description = "Public IP of GPU inference instance"
  value       = aws_instance.gpu.public_ip
}

output "qdrant_instance_ip" {
  description = "Public IP of Qdrant instance"
  value       = aws_instance.qdrant.public_ip
}

output "s3_bucket_name" {
  description = "Name of the video storage S3 bucket"
  value       = aws_s3_bucket.videos.id
}

output "ecr_repo_urls" {
  description = "URLs of ECR repositories"
  value       = { for k, v in aws_ecr_repository.repos : k => v.repository_url }
}

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.backend.dns_name
}
