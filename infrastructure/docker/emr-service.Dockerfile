# Stage 1: Base
FROM eclipse-temurin:17-jre-alpine AS base

# Install build essentials and security tools
RUN apk add --no-cache \
    curl=8.4.0-r0 \
    tzdata=2023c-r1 \
    ca-certificates=20230506-r0 \
    tini=0.19.0-r1

# Set working directory
WORKDIR /app

# Stage 2: Builder
FROM base AS builder

# Install build dependencies
RUN apk add --no-cache \
    maven=3.9.5-r0 \
    openjdk17=17.0.8_p7-r0

# Copy source files
COPY src/backend/packages/emr-service/pom.xml ./
COPY src/backend/packages/emr-service/src ./src/
COPY src/backend/packages/shared ./shared/

# Build application
RUN mvn clean package -DskipTests

# Run tests
RUN mvn test

# Install security scanning tools
RUN apk add --no-cache trivy=0.44.1-r0
RUN trivy filesystem --exit-code 1 --severity HIGH,CRITICAL .

# Run OWASP dependency check
RUN mvn org.owasp:dependency-check-maven:check

# Generate Software Bill of Materials (SBOM)
RUN mvn org.cyclonedx:cyclonedx-maven-plugin:makeAggregateBom

# Stage 3: Production
FROM base AS production

# Create non-root user
RUN adduser -D -u 10001 emrservice

# Set secure permissions
RUN mkdir -p /app/logs /app/tmp && \
    chown -R emrservice:emrservice /app && \
    chmod -R 550 /app && \
    chmod -R 770 /app/logs /app/tmp

# Copy built artifacts from builder
COPY --from=builder --chown=emrservice:emrservice /app/target/*.jar /app/app.jar
COPY --from=builder --chown=emrservice:emrservice /app/target/libs /app/libs

# Set secure environment variables
ENV JAVA_TOOL_OPTIONS="-XX:+UseContainerSupport \
    -XX:MaxRAMPercentage=75.0 \
    -XX:+ExitOnOutOfMemoryError \
    -Djava.security.egd=file:/dev/urandom \
    -Dfile.encoding=UTF-8 \
    -Duser.timezone=UTC \
    -Djava.awt.headless=true \
    -Dspring.security.strategy=MODE_GLOBAL"

ENV EMR_SERVICE_PORT=3001 \
    FHIR_VERSION=R4 \
    HL7_VERSION=2.5.1

# Configure security options
RUN echo "security.provider.1=SUN" > /opt/java/openjdk/conf/security/java.security && \
    echo "security.provider.2=SunRsaSign" >> /opt/java/openjdk/conf/security/java.security

# Set resource limits
LABEL org.opencontainers.image.memory-limit="512M" \
      org.opencontainers.image.cpu-limit="1.0" \
      org.opencontainers.image.pids-limit="50"

# Expose service port
EXPOSE 3001

# Configure healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD java -cp app.jar com.emrtask.health.HealthCheck

# Switch to non-root user
USER emrservice

# Use tini as init
ENTRYPOINT ["/sbin/tini", "--"]

# Set read-only root filesystem
RUN chmod a-w /

# Drop all capabilities except required ones
RUN setcap cap_net_bind_service=+ep /usr/bin/java

# Start application with secure flags
CMD ["java", \
     "-jar", \
     "-Dspring.profiles.active=production", \
     "-Djava.security.properties=/opt/java/openjdk/conf/security/java.security", \
     "/app/app.jar"]