# ============================================
# 智销AI - Dockerfile (Multi-stage build)
# ============================================

# Stage 1: Build
FROM maven:3.9-eclipse-temurin-17 AS builder

WORKDIR /build

# Copy parent pom and module poms
COPY pom.xml .
COPY zhixiao-common/pom.xml zhixiao-common/
COPY zhixiao-auth/pom.xml zhixiao-auth/
COPY zhixiao-user/pom.xml zhixiao-user/
COPY zhixiao-customer/pom.xml zhixiao-customer/
COPY zhixiao-sales/pom.xml zhixiao-sales/
COPY zhixiao-recording/pom.xml zhixiao-recording/
COPY zhixiao-asr/pom.xml zhixiao-asr/
COPY zhixiao-ai/pom.xml zhixiao-ai/
COPY zhixiao-report/pom.xml zhixiao-report/
COPY zhixiao-gateway/pom.xml zhixiao-gateway/

# Download dependencies (cached layer)
RUN mvn dependency:go-offline -B || true

# Copy source code
COPY zhixiao-common/src ./zhixiao-common/src
COPY zhixiao-auth/src ./zhixiao-auth/src
COPY zhixiao-user/src ./zhixiao-user/src
COPY zhixiao-customer/src ./zhixiao-customer/src
COPY zhixiao-sales/src ./zhixiao-sales/src
COPY zhixiao-recording/src ./zhixiao-recording/src
COPY zhixiao-asr/src ./zhixiao-asr/src
COPY zhixiao-ai/src ./zhixiao-ai/src
COPY zhixiao-report/src ./zhixiao-report/src
COPY zhixiao-gateway/src ./zhixiao-gateway/src

# Build application
RUN mvn clean package -DskipTests -B

# Stage 2: Runtime
FROM eclipse-temurin:17-jre AS runtime

WORKDIR /app

# Copy built JAR from builder stage
COPY --from=builder /build/zhixiao-gateway/target/zhixiao-gateway-*.jar /app/zhixiao-gateway.jar

# Expose application port
EXPOSE 8080

# Set JVM options
ENV JAVA_OPTS="-Xmx512m -Xms256m -XX:+UseG1GC"

# Run application
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar /app/zhixiao-gateway.jar"]
