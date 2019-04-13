data "aws_route53_zone" "retrofuture_media" {
  name = "retrofuture.studio."
}

resource "aws_route53_record" "retrofuture_media" {
  zone_id = "${data.aws_route53_zone.retrofuture_media.zone_id}"
  name    = "media.${data.aws_route53_zone.retrofuture_media.name}"
  type    = "CNAME"
  ttl     = "300"
  records = ["${aws_s3_bucket.retrofuture_media.bucket_domain_name}"]
}
