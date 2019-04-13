provider "aws" {
  access_key = "${var.aws["access_key"]}"
  secret_key = "${var.aws["secret_key"]}"
  region     = "us-east-1"
}
