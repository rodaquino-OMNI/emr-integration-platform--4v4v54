#!/bin/bash
# ============================================================================
# EKS Node User Data Script
# ============================================================================
# Purpose: Bootstrap script for EKS worker nodes
# Features: Custom configuration, monitoring, security hardening
# ============================================================================

set -o xtrace

# Configure kubelet
/etc/eks/bootstrap.sh ${cluster_name} ${bootstrap_arguments}

# Install CloudWatch agent
wget https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm
rpm -U ./amazon-cloudwatch-agent.rpm

# Configure CloudWatch agent
cat <<EOF > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
{
  "metrics": {
    "namespace": "EKS/NodeMetrics",
    "metrics_collected": {
      "cpu": {
        "measurement": [
          {"name": "cpu_usage_idle", "rename": "CPU_IDLE", "unit": "Percent"},
          {"name": "cpu_usage_iowait", "rename": "CPU_IOWAIT", "unit": "Percent"}
        ],
        "metrics_collection_interval": 60,
        "totalcpu": false
      },
      "disk": {
        "measurement": [
          {"name": "used_percent", "rename": "DISK_USED", "unit": "Percent"}
        ],
        "metrics_collection_interval": 60,
        "resources": ["*"]
      },
      "diskio": {
        "measurement": [
          {"name": "io_time"}
        ],
        "metrics_collection_interval": 60,
        "resources": ["*"]
      },
      "mem": {
        "measurement": [
          {"name": "mem_used_percent", "rename": "MEM_USED", "unit": "Percent"}
        ],
        "metrics_collection_interval": 60
      },
      "netstat": {
        "measurement": [
          {"name": "tcp_established", "rename": "TCP_ESTABLISHED", "unit": "Count"},
          {"name": "tcp_time_wait", "rename": "TCP_TIME_WAIT", "unit": "Count"}
        ],
        "metrics_collection_interval": 60
      }
    }
  }
}
EOF

# Start CloudWatch agent
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config \
  -m ec2 \
  -s \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json

# Enable and start CloudWatch agent service
systemctl enable amazon-cloudwatch-agent
systemctl start amazon-cloudwatch-agent

# Security hardening
# Disable unnecessary services
systemctl disable postfix || true
systemctl stop postfix || true

# Set file descriptors limit
echo "fs.file-max = 2097152" >> /etc/sysctl.conf
sysctl -p

# Configure container runtime limits
mkdir -p /etc/systemd/system/containerd.service.d
cat <<EOF > /etc/systemd/system/containerd.service.d/limits.conf
[Service]
LimitNOFILE=1048576
LimitNPROC=infinity
LimitCORE=infinity
EOF

systemctl daemon-reload
systemctl restart containerd

# Signal completion
/opt/aws/bin/cfn-signal --exit-code $? \
  --stack ${cluster_name} \
  --resource NodeGroup \
  --region $(curl -s http://169.254.169.254/latest/meta-data/placement/region)
