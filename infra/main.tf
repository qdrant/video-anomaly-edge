terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

locals {
  name = var.project_name
  azs  = ["${var.region}a", "${var.region}b"]
}

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "${local.name}-vpc" }
}

resource "aws_internet_gateway" "gw" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.name}-igw" }
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.${count.index + 1}.0/24"
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true
  tags                    = { Name = "${local.name}-public-${count.index}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.gw.id
  }
  tags = { Name = "${local.name}-public-rt" }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "gpu" {
  name_prefix = "${local.name}-gpu-"
  vpc_id      = aws_vpc.main.id
  description = "GPU inference instance"
  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
  }
  ingress {
    description = "App port 9876"
    from_port   = 9876
    to_port     = 9876
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.main.cidr_block]
  }
  ingress {
    description = "App port 9877"
    from_port   = 9877
    to_port     = 9877
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.main.cidr_block]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "${local.name}-gpu-sg" }
}

resource "aws_security_group" "qdrant" {
  name_prefix = "${local.name}-qdrant-"
  vpc_id      = aws_vpc.main.id
  description = "Qdrant vector DB"
  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
  }
  ingress {
    description = "Qdrant HTTP"
    from_port   = 6333
    to_port     = 6333
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.main.cidr_block]
  }
  ingress {
    description = "Qdrant gRPC"
    from_port   = 6334
    to_port     = 6334
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.main.cidr_block]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "${local.name}-qdrant-sg" }
}

resource "aws_security_group" "alb" {
  name_prefix = "${local.name}-alb-"
  vpc_id      = aws_vpc.main.id
  description = "Application Load Balancer"
  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "${local.name}-alb-sg" }
}

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ec2" {
  name               = "${local.name}-ec2-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

data "aws_iam_policy_document" "ec2_perms" {
  statement {
    actions   = ["s3:GetObject", "s3:ListBucket"]
    resources = [aws_s3_bucket.videos.arn, "${aws_s3_bucket.videos.arn}/*"]
  }
  statement {
    actions = [
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:GetAuthorizationToken",
      "ecr:BatchCheckLayerAvailability",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "ec2" {
  name   = "${local.name}-ec2-policy"
  role   = aws_iam_role.ec2.id
  policy = data.aws_iam_policy_document.ec2_perms.json
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${local.name}-ec2-profile"
  role = aws_iam_role.ec2.name
}

data "aws_ami" "deep_learning" {
  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["Deep Learning AMI GPU PyTorch * (Amazon Linux 2)*"]
  }
  filter {
    name   = "state"
    values = ["available"]
  }
}

data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
  filter {
    name   = "state"
    values = ["available"]
  }
}

resource "aws_instance" "gpu" {
  ami                    = data.aws_ami.deep_learning.id
  instance_type          = var.gpu_instance_type
  key_name               = var.key_pair_name
  subnet_id              = aws_subnet.public[0].id
  vpc_security_group_ids = [aws_security_group.gpu.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name
  root_block_device {
    volume_size = 100
    volume_type = "gp3"
  }
  tags = { Name = "${local.name}-gpu" }
}

resource "aws_instance" "qdrant" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.qdrant_instance_type
  key_name               = var.key_pair_name
  subnet_id              = aws_subnet.public[0].id
  vpc_security_group_ids = [aws_security_group.qdrant.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name
  root_block_device {
    volume_size = 50
    volume_type = "gp3"
  }
  user_data = <<-USERDATA
    #!/bin/bash
    dnf install -y docker
    systemctl enable docker
    systemctl start docker
    docker run -d --restart always \
      -p 6333:6333 -p 6334:6334 \
      -v /opt/qdrant/storage:/qdrant/storage \
      qdrant/qdrant:latest
  USERDATA
  tags = { Name = "${local.name}-qdrant" }
}

resource "aws_s3_bucket" "videos" {
  bucket_prefix = "${local.name}-videos-"
  force_destroy = false
  tags          = { Name = "${local.name}-videos" }
}

resource "aws_s3_bucket_versioning" "videos" {
  bucket = aws_s3_bucket.videos.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "videos" {
  bucket                  = aws_s3_bucket.videos.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_ecr_repository" "repos" {
  for_each             = toset(["model-server", "backend", "frontend"])
  name                 = "${local.name}/${each.key}"
  image_tag_mutability = "MUTABLE"
  force_delete         = true
  image_scanning_configuration {
    scan_on_push = true
  }
  tags = { Name = "${local.name}-${each.key}" }
}

resource "aws_lb" "backend" {
  name               = "${local.name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
  tags               = { Name = "${local.name}-alb" }
}

resource "aws_lb_target_group" "backend" {
  name     = "${local.name}-backend-tg"
  port     = 9876
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id
  health_check {
    path                = "/health"
    interval            = 30
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
  tags = { Name = "${local.name}-backend-tg" }
}

resource "aws_lb_target_group_attachment" "gpu" {
  target_group_arn = aws_lb_target_group.backend.arn
  target_id        = aws_instance.gpu.id
  port             = 9876
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.backend.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }
}
