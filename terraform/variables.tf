variable "region" {
  type    = string
  default = "ca-central-1"
}

variable "alert_email" {
  type        = string
  description = "Receives the monthly budget alert"
}

variable "database_url" {
  type        = string
  sensitive   = true
  description = "Neon connection string for the Lambda"
}
