#!/bin/bash
# validate-jdk.sh
# Master JDK 17+ validation script for EMR Integration Platform
# Usage: ./scripts/validate-jdk.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ANDROID_DIR="$PROJECT_ROOT/src/android"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

pass() { echo -e "${GREEN}✓${NC} $1"; ((PASS_COUNT++)); }
fail() { echo -e "${RED}✗${NC} $1"; ((FAIL_COUNT++)); }
warn() { echo -e "${YELLOW}⚠${NC} $1"; ((WARN_COUNT++)); }
info() { echo -e "${BLUE}ℹ${NC} $1"; }

echo "======================================"
echo "  JDK 17+ Validation Test Suite"
echo "  EMR Integration Platform"
echo "======================================"

# ===== SYSTEM LEVEL TESTS =====
echo -e "\n${BLUE}[SYSTEM LEVEL CHECKS]${NC}"

# Test: Java runtime
if command -v java &> /dev/null; then
  JAVA_VER=$(java -version 2>&1 | grep -oP 'version "\K\d+' || echo "0")
  if [ "$JAVA_VER" -ge 17 ]; then
    pass "Java runtime version $JAVA_VER (>= 17 required)"
  else
    fail "Java runtime version $JAVA_VER (< 17 REQUIRED)"
  fi
else
  fail "Java runtime not found - Install JDK 17+"
fi

# Test: Java compiler
if command -v javac &> /dev/null; then
  JAVAC_VER=$(javac -version 2>&1 | grep -oP 'javac \K\d+' || echo "0")
  if [ "$JAVAC_VER" -ge 17 ]; then
    pass "Java compiler version $JAVAC_VER (>= 17 required)"
  else
    fail "Java compiler version $JAVAC_VER (< 17 REQUIRED)"
  fi
else
  fail "Java compiler (javac) not found - Install JDK 17+"
fi

# Test: JAVA_HOME
if [ -n "$JAVA_HOME" ]; then
  if [ -d "$JAVA_HOME" ]; then
    if [ -f "$JAVA_HOME/bin/java" ]; then
      HOME_VER=$("$JAVA_HOME/bin/java" -version 2>&1 | grep -oP 'version "\K\d+' || echo "0")
      if [ "$HOME_VER" -ge 17 ]; then
        pass "JAVA_HOME points to JDK $HOME_VER at $JAVA_HOME"
      else
        fail "JAVA_HOME points to JDK $HOME_VER (< 17 required)"
      fi
    else
      fail "JAVA_HOME/bin/java not found at $JAVA_HOME"
    fi
  else
    fail "JAVA_HOME directory does not exist: $JAVA_HOME"
  fi
else
  warn "JAVA_HOME not set (Gradle may use system default)"
fi

# Test: macOS JDK installations
if [[ "$OSTYPE" == "darwin"* ]]; then
  if command -v /usr/libexec/java_home &> /dev/null; then
    JDK_17_PATH=$(/usr/libexec/java_home -v 17 2>/dev/null || echo "")
    if [ -n "$JDK_17_PATH" ]; then
      pass "JDK 17+ found at: $JDK_17_PATH"
    else
      warn "JDK 17 not found via java_home (may have JDK 18+)"
      info "Available JDKs:"
      /usr/libexec/java_home -V 2>&1 | grep -E "^\s+[0-9]" | sed 's/^/    /'
    fi
  fi
fi

# ===== IDE LEVEL TESTS =====
echo -e "\n${BLUE}[IDE CONFIGURATION CHECKS]${NC}"

if [ -f "$PROJECT_ROOT/.idea/misc.xml" ]; then
  if grep -qE "jdk-1[7-9]|jdk-2[0-9]" "$PROJECT_ROOT/.idea/misc.xml" 2>/dev/null; then
    pass "IntelliJ/Android Studio SDK configured for JDK 17+"
  else
    warn "IDE project SDK may not be JDK 17+ (verify in IDE settings)"
  fi
else
  info "No .idea/misc.xml found (IDE not configured or not using JetBrains IDE)"
fi

if [ -f "$PROJECT_ROOT/.idea/gradle.xml" ]; then
  if grep -q "gradleJvm" "$PROJECT_ROOT/.idea/gradle.xml" 2>/dev/null; then
    pass "IDE Gradle JVM configured"
  else
    info "No explicit Gradle JVM in .idea/gradle.xml"
  fi
fi

# ===== PROJECT LEVEL TESTS =====
echo -e "\n${BLUE}[PROJECT CONFIGURATION CHECKS]${NC}"

if [ -f "$ANDROID_DIR/build.gradle" ]; then
  # Check source compatibility
  if grep -qE "sourceCompatibility.*(JavaVersion\.)?VERSION_17|sourceCompatibility.*17" "$ANDROID_DIR/build.gradle" "$ANDROID_DIR/app/build.gradle" 2>/dev/null; then
    pass "Source compatibility set to Java 17"
  else
    fail "Source compatibility not set to Java 17 in build.gradle"
  fi

  # Check target compatibility
  if grep -qE "targetCompatibility.*(JavaVersion\.)?VERSION_17|targetCompatibility.*17" "$ANDROID_DIR/build.gradle" "$ANDROID_DIR/app/build.gradle" 2>/dev/null; then
    pass "Target compatibility set to Java 17"
  else
    fail "Target compatibility not set to Java 17 in build.gradle"
  fi

  # Check Kotlin JVM target
  if grep -qE "jvmTarget.*['\"]17['\"]|jvmTarget = '17'" "$ANDROID_DIR/build.gradle" "$ANDROID_DIR/app/build.gradle" 2>/dev/null; then
    pass "Kotlin JVM target set to 17"
  else
    warn "Kotlin JVM target may not be set to 17 (check build.gradle files)"
  fi

  # Check Android Gradle Plugin version
  AGP_VERSION=$(grep -oP 'com\.android\.tools\.build:gradle:\K[0-9.]+' "$ANDROID_DIR/build.gradle" | head -1)
  if [ -n "$AGP_VERSION" ]; then
    AGP_MAJOR=$(echo "$AGP_VERSION" | cut -d. -f1)
    AGP_MINOR=$(echo "$AGP_VERSION" | cut -d. -f2)
    if [ "$AGP_MAJOR" -ge 8 ] || ([ "$AGP_MAJOR" -eq 7 ] && [ "$AGP_MINOR" -ge 3 ]); then
      pass "Android Gradle Plugin $AGP_VERSION supports JDK 17+"
    else
      fail "Android Gradle Plugin $AGP_VERSION may not support JDK 17+ (upgrade to 7.3+)"
    fi
  else
    warn "Could not detect Android Gradle Plugin version"
  fi
else
  fail "build.gradle not found at $ANDROID_DIR/build.gradle"
fi

# Check gradle.properties
if [ -f "$ANDROID_DIR/gradle.properties" ]; then
  if grep -q "org.gradle.java.home" "$ANDROID_DIR/gradle.properties"; then
    GRADLE_JAVA_HOME=$(grep "org.gradle.java.home" "$ANDROID_DIR/gradle.properties" | cut -d'=' -f2)
    info "Gradle configured to use: $GRADLE_JAVA_HOME"
  fi
fi

# ===== BUILD LEVEL TESTS =====
echo -e "\n${BLUE}[BUILD SYSTEM CHECKS]${NC}"

if [ -f "$ANDROID_DIR/gradlew" ]; then
  cd "$ANDROID_DIR"

  # Test: Gradle wrapper execution
  if ./gradlew --version &> /dev/null; then
    GRADLE_VERSION=$(./gradlew --version 2>&1 | grep "Gradle" | awk '{print $2}')
    pass "Gradle wrapper $GRADLE_VERSION executes successfully"

    # Check Gradle JVM
    GRADLE_JVM=$(./gradlew -version 2>&1 | grep "JVM:" | awk '{print $2}' | cut -d'.' -f1)
    if [ -n "$GRADLE_JVM" ]; then
      if [ "$GRADLE_JVM" -ge 17 ]; then
        pass "Gradle uses JVM $GRADLE_JVM (>= 17 required)"
      else
        fail "Gradle uses JVM $GRADLE_JVM (< 17 REQUIRED - set JAVA_HOME)"
      fi
    else
      warn "Could not detect Gradle JVM version"
    fi
  else
    fail "Gradle wrapper failed to execute"
  fi

  # Test: Task listing
  info "Testing Gradle task listing..."
  if timeout 30 ./gradlew tasks --warning-mode=none &> /dev/null; then
    pass "Gradle can list tasks"
  else
    fail "Gradle task listing failed or timed out"
  fi

  # Test: Build dry run
  info "Testing build dry-run (this may take a moment)..."
  if timeout 60 ./gradlew assembleDebug --dry-run --warning-mode=none &> /dev/null; then
    pass "Build dry-run succeeds"
  else
    fail "Build dry-run failed - check build configuration"
  fi

else
  fail "Gradle wrapper not found at $ANDROID_DIR/gradlew"
fi

# ===== SUMMARY =====
echo -e "\n======================================"
echo "  VALIDATION SUMMARY"
echo "======================================"
echo -e "${GREEN}✓ Passed:${NC}   $PASS_COUNT"
echo -e "${YELLOW}⚠ Warnings:${NC} $WARN_COUNT"
echo -e "${RED}✗ Failed:${NC}   $FAIL_COUNT"
echo "======================================"

if [ $FAIL_COUNT -eq 0 ]; then
  echo -e "\n${GREEN}✓ All critical tests passed! JDK 17+ is properly configured.${NC}"
  echo -e "\nYou can now build the Android project:"
  echo -e "  ${BLUE}cd src/android && ./gradlew assembleDebug${NC}"
  exit 0
else
  echo -e "\n${RED}✗ Some tests failed. Please fix the issues above.${NC}"
  echo -e "\n${YELLOW}Quick Fix Guide:${NC}"

  if ! command -v java &> /dev/null; then
    echo -e "  1. Install JDK 17+:"
    echo -e "     ${BLUE}macOS:${NC}  brew install openjdk@17"
    echo -e "     ${BLUE}Ubuntu:${NC} sudo apt install openjdk-17-jdk"
  fi

  if [ -z "$JAVA_HOME" ] || [ "${JAVA_VER:-0}" -lt 17 ]; then
    echo -e "  2. Set JAVA_HOME (add to ~/.zshrc or ~/.bashrc):"
    echo -e "     ${BLUE}export JAVA_HOME=\$(/usr/libexec/java_home -v 17)${NC}  # macOS"
    echo -e "     ${BLUE}export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64${NC}  # Linux"
    echo -e "     ${BLUE}export PATH=\"\$JAVA_HOME/bin:\$PATH\"${NC}"
  fi

  echo -e "\n  3. Reload shell configuration:"
  echo -e "     ${BLUE}source ~/.zshrc${NC}  # or source ~/.bashrc"

  echo -e "\n  4. Re-run this validation:"
  echo -e "     ${BLUE}./scripts/validate-jdk.sh${NC}"

  exit 1
fi
