variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for the cluster and network"
  type        = string
  default     = "us-central1"
}

variable "cluster_name" {
  description = "Name of the GKE cluster"
  type        = string
  default     = "tier3-gke"
}

variable "environment" {
  description = "Deployment environment label"
  type        = string
  default     = "production"
}

variable "node_machine_type" {
  description = "Machine type for the primary node pool"
  type        = string
  default     = "e2-standard-4"
}

variable "min_node_count" {
  description = "Minimum nodes per zone (autoscaling)"
  type        = number
  default     = 1
}

variable "max_node_count" {
  description = "Maximum nodes per zone (autoscaling)"
  type        = number
  default     = 5
}

variable "master_ipv4_cidr_block" {
  description = "CIDR for the private control plane endpoint"
  type        = string
  default     = "172.16.0.0/28"
}

variable "authorized_networks" {
  description = "CIDRs allowed to reach the control plane"
  type = list(object({
    cidr_block   = string
    display_name = string
  }))
  default = []
}
