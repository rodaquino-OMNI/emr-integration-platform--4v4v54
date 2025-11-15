# JDK 17+ Validation and Testing Strategy

## Executive Summary

**Current State**: JDK is NOT installed on the system
**Requirement**: JDK 17+ required for Android Gradle build (Android Gradle Plugin 8.0.0)
**Root Cause**: Complete absence of Java runtime environment

---

## 1. Validation Strategy Overview

### 1.1 Testing Approach
- **Multi-layered Validation**: System → IDE → Project → Build
- **Scenario-based Testing**: Cover all failure modes
- **Progressive Verification**: Each solution step must be validated
- **Regression Prevention**: Ensure fixes don't break other components

### 1.2 Success Criteria
1. ✅ JDK 17 or higher installed and accessible
2. ✅ JAVA_HOME environment variable correctly configured
3. ✅ Gradle can detect and use JDK 17+
4. ✅ Android Gradle build completes successfully
5. ✅ IDE (if used) recognizes JDK 17+
6. ✅ All build tools can locate JDK

---

## 2. Test Scenarios

### Scenario 1: JDK Not Installed (CURRENT STATE)
**Symptoms**:
```
Unable to locate a Java Runtime
java -version → Error
echo $JAVA_HOME → Empty
```

**Expected Test Results**:
- [ ] `java -version` fails
- [ ] `javac -version` fails
- [ ] `$JAVA_HOME` is empty or undefined
- [ ] `/usr/libexec/java_home -V` shows no JDKs (macOS)
- [ ] Gradle build fails with JDK requirement error

**Validation Commands**:
```bash
# Test 1.1: Check Java executable
java -version 2>&1 | grep -q "Unable to locate" && echo "FAIL: Java not found" || echo "PASS: Java found"

# Test 1.2: Check Java compiler
javac -version 2>&1 | grep -q "command not found" && echo "FAIL: javac not found" || echo "PASS: javac found"

# Test 1.3: Check JAVA_HOME
[ -z "$JAVA_HOME" ] && echo "FAIL: JAVA_HOME not set" || echo "PASS: JAVA_HOME = $JAVA_HOME"

# Test 1.4: Check macOS Java installations
/usr/libexec/java_home -V 2>&1 | grep -q "Unable to find" && echo "FAIL: No JDK installations" || echo "PASS: JDK found"

# Test 1.5: Attempt Gradle build
cd src/android && ./gradlew --version 2>&1 | grep -q "ERROR" && echo "FAIL: Gradle can't find JDK" || echo "PASS: Gradle OK"
```

---

### Scenario 2: JDK < 17 Installed
**Symptoms**:
```
java -version → openjdk version "11.0.x"
Gradle build fails: Requires Java 17 but found Java 11
```

**Expected Test Results**:
- [ ] `java -version` shows version < 17
- [ ] `$JAVA_HOME` points to JDK < 17
- [ ] Gradle detects incompatible JDK version
- [ ] Build fails with version mismatch error

**Validation Commands**:
```bash
# Test 2.1: Extract Java version and compare
java -version 2>&1 | grep -oP 'version "\K\d+' | awk '{if ($1 < 17) print "FAIL: Java " $1 " < 17"; else print "PASS: Java " $1 " >= 17"}'

# Test 2.2: Check Gradle's detected JDK version
cd src/android && ./gradlew -version 2>&1 | grep "JVM:" | awk '{print $2}' | awk -F. '{if ($1 < 17) print "FAIL: Gradle JVM " $1; else print "PASS: Gradle JVM " $1}'

# Test 2.3: Verify toolchain version
cd src/android && ./gradlew javaToolchains 2>&1 | grep -A5 "JDK" | grep "Version" | awk '{if ($2 < 17) print "FAIL: Toolchain < 17"; else print "PASS: Toolchain >= 17"}'
```

---

### Scenario 3: JDK 17+ Installed but Not Configured
**Symptoms**:
```
JDK 17 exists in /Library/Java/JavaVirtualMachines/
But $JAVA_HOME is empty or points to wrong version
Gradle can't find correct JDK
```

**Expected Test Results**:
- [ ] JDK 17+ exists on filesystem
- [ ] `java -version` shows wrong version or fails
- [ ] `$JAVA_HOME` is incorrect/missing
- [ ] Gradle uses system default instead of JDK 17+

**Validation Commands**:
```bash
# Test 3.1: Find installed JDKs (macOS)
/usr/libexec/java_home -V 2>&1 | grep -E "17|18|19|20|21" && echo "PASS: JDK 17+ installed" || echo "FAIL: No JDK 17+"

# Test 3.2: Check if JAVA_HOME points to JDK 17+
if [ -n "$JAVA_HOME" ]; then
  "$JAVA_HOME/bin/java" -version 2>&1 | grep -oP 'version "\K\d+' | awk '{if ($1 >= 17) print "PASS: JAVA_HOME JDK >= 17"; else print "FAIL: JAVA_HOME JDK < 17"}'
else
  echo "FAIL: JAVA_HOME not set"
fi

# Test 3.3: Verify Gradle can find JDK 17+
cd src/android && ./gradlew --version 2>&1 | grep "JVM:" | awk '{print $2}' | awk -F. '{if ($1 >= 17) print "PASS"; else print "FAIL"}'

# Test 3.4: Check gradle.properties for JDK configuration
[ -f gradle.properties ] && grep -q "org.gradle.java.home" gradle.properties && echo "PASS: Gradle JDK configured" || echo "INFO: No explicit JDK config"
```

---

### Scenario 4: Multiple JDK Versions Causing Conflicts
**Symptoms**:
```
JDK 11, 17, 21 all installed
$JAVA_HOME points to JDK 11
Gradle picks up wrong version
Build fails intermittently
```

**Expected Test Results**:
- [ ] Multiple JDK versions detected
- [ ] `java -version` shows different version than Gradle
- [ ] IDE uses different JDK than command line
- [ ] Inconsistent build results

**Validation Commands**:
```bash
# Test 4.1: List all installed JDKs
/usr/libexec/java_home -V 2>&1 | tee jdk_versions.txt
JDK_COUNT=$(grep -c "JavaVirtualMachines" jdk_versions.txt 2>/dev/null || echo 0)
[ "$JDK_COUNT" -gt 1 ] && echo "WARNING: Multiple JDKs found ($JDK_COUNT)" || echo "INFO: Single JDK"

# Test 4.2: Compare system Java vs JAVA_HOME
SYSTEM_JAVA=$(java -version 2>&1 | grep -oP 'version "\K\d+' || echo 0)
if [ -n "$JAVA_HOME" ]; then
  HOME_JAVA=$("$JAVA_HOME/bin/java" -version 2>&1 | grep -oP 'version "\K\d+' || echo 0)
  [ "$SYSTEM_JAVA" -eq "$HOME_JAVA" ] && echo "PASS: Consistent" || echo "WARNING: Mismatch (System=$SYSTEM_JAVA, HOME=$HOME_JAVA)"
fi

# Test 4.3: Check IDE project JDK
[ -d ".idea" ] && grep -r "JDK" .idea/misc.xml 2>/dev/null | grep -oP 'jdk-\K\d+' && echo "IDE JDK detected" || echo "No IntelliJ config"

# Test 4.4: Verify Gradle wrapper uses correct JDK
cd src/android && ./gradlew properties 2>&1 | grep "runtime" | grep "JVM"
```

---

## 3. Solution Validation Steps

### 3.1 Installing JDK 17+ (Primary Solution)

#### Installation Verification
```bash
# Step 1: Verify download (if manual)
# macOS: Check .dmg or .pkg exists
ls -lh ~/Downloads/jdk-17*.{dmg,pkg} 2>/dev/null && echo "PASS: Installer found" || echo "FAIL: No installer"

# Step 2: Verify installation completed
# macOS
/usr/libexec/java_home -V 2>&1 | grep -E "17|18|19|20|21" && echo "PASS: JDK 17+ installed" || echo "FAIL: Installation failed"

# Linux
dpkg -l | grep -i openjdk-17 && echo "PASS: JDK 17 installed" || echo "FAIL: Not installed"

# Step 3: Verify executable permissions
[ -x "/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home/bin/java" ] && echo "PASS: Executable" || echo "FAIL: Not executable"

# Step 4: Verify version
java -version 2>&1 | grep -oP 'version "\K\d+' | awk '{if ($1 >= 17) print "PASS: Version " $1; else print "FAIL: Version " $1}'

# Step 5: Verify compiler
javac -version 2>&1 | grep -oP 'javac \K\d+' | awk '{if ($1 >= 17) print "PASS: Compiler " $1; else print "FAIL: Compiler " $1}'
```

#### Post-Installation Tests
```bash
# Test Suite A: Basic Java functionality
java -version && echo "✓ Java runtime works"
javac -version && echo "✓ Java compiler works"
java -XshowSettings:properties -version 2>&1 | grep "java.home" && echo "✓ Java home detected"

# Test Suite B: Gradle integration
cd src/android
./gradlew --version && echo "✓ Gradle wrapper works"
./gradlew tasks --all >/dev/null 2>&1 && echo "✓ Gradle can list tasks"
./gradlew dependencies >/dev/null 2>&1 && echo "✓ Gradle can resolve dependencies"

# Test Suite C: Build test (dry run)
./gradlew assembleDebug --dry-run && echo "✓ Build plan succeeds"
```

---

### 3.2 Configuring JAVA_HOME

#### Configuration Verification
```bash
# Step 1: Verify JAVA_HOME is set
[ -n "$JAVA_HOME" ] && echo "PASS: JAVA_HOME = $JAVA_HOME" || echo "FAIL: JAVA_HOME not set"

# Step 2: Verify JAVA_HOME points to valid JDK
[ -d "$JAVA_HOME" ] && echo "PASS: Directory exists" || echo "FAIL: Directory not found"
[ -f "$JAVA_HOME/bin/java" ] && echo "PASS: java executable exists" || echo "FAIL: No java executable"
[ -f "$JAVA_HOME/bin/javac" ] && echo "PASS: javac exists" || echo "FAIL: No javac"

# Step 3: Verify JAVA_HOME version
"$JAVA_HOME/bin/java" -version 2>&1 | grep -oP 'version "\K\d+' | awk '{if ($1 >= 17) print "PASS: JDK " $1; else print "FAIL: JDK " $1}'

# Step 4: Verify environment persistence
# Check shell config files
grep -q "JAVA_HOME" ~/.zshrc ~/.bashrc ~/.bash_profile 2>/dev/null && echo "PASS: Persisted in shell config" || echo "WARNING: Not persisted"

# Step 5: Verify Gradle picks up JAVA_HOME
cd src/android && ./gradlew -version 2>&1 | grep "JVM:" | grep -q "$(echo $JAVA_HOME | cut -d'/' -f1-5)" && echo "PASS: Gradle uses JAVA_HOME" || echo "WARNING: Gradle uses different JDK"
```

#### Environment Validation Tests
```bash
# Test Suite D: Environment consistency
echo "System Java: $(java -version 2>&1 | head -1)"
echo "JAVA_HOME Java: $($JAVA_HOME/bin/java -version 2>&1 | head -1)"
echo "Gradle JVM: $(cd src/android && ./gradlew -version 2>&1 | grep JVM:)"

# Test Suite E: PATH verification
which java && echo "✓ java in PATH"
which javac && echo "✓ javac in PATH"
echo $PATH | grep -q "$JAVA_HOME/bin" && echo "✓ JAVA_HOME/bin in PATH" || echo "WARNING: JAVA_HOME/bin not in PATH"

# Test Suite F: New shell verification
/bin/zsh -c 'echo $JAVA_HOME' | grep -q "/" && echo "✓ JAVA_HOME available in new shell" || echo "FAIL: Not persisted"
```

---

### 3.3 IDE Configuration (Android Studio / IntelliJ IDEA)

#### IDE Verification Steps
```bash
# Step 1: Check IDE configuration files
# IntelliJ IDEA / Android Studio
[ -f ".idea/misc.xml" ] && grep -q "jdk-17\|jdk-18\|jdk-19\|jdk-20\|jdk-21" .idea/misc.xml && echo "PASS: IDE configured for JDK 17+" || echo "INFO: Check IDE settings"

# Step 2: Check Gradle JDK setting in IDE
[ -f ".idea/gradle.xml" ] && grep -q "gradleJvm" .idea/gradle.xml && echo "PASS: Gradle JVM configured in IDE" || echo "INFO: No explicit Gradle JVM"

# Step 3: Verify Android SDK compatibility
[ -f "local.properties" ] && grep -q "sdk.dir" local.properties && echo "PASS: Android SDK configured" || echo "WARNING: No SDK configuration"
```

#### Manual IDE Verification Checklist
```
[ ] File → Project Structure → Project → SDK shows JDK 17+
[ ] File → Project Structure → Modules → Language Level is 17
[ ] File → Settings → Build → Build Tools → Gradle → Gradle JDK is 17+
[ ] Android Studio → Preferences → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK is 17+
[ ] IDE can compile Java 17 code without errors
[ ] IDE Android preview works (if applicable)
```

---

### 3.4 Project-Level Configuration

#### Gradle Configuration Verification
```bash
# Step 1: Verify gradle.properties
cd src/android
if [ -f "gradle.properties" ]; then
  grep -q "org.gradle.java.home" gradle.properties && echo "PASS: Java home configured" || echo "INFO: Using system default"
  grep -q "org.gradle.jvmargs" gradle.properties && echo "INFO: JVM args configured"
fi

# Step 2: Verify build.gradle JDK compatibility settings
grep -r "sourceCompatibility.*17\|VERSION_17" build.gradle && echo "PASS: Source compatibility = 17"
grep -r "targetCompatibility.*17\|VERSION_17" build.gradle && echo "PASS: Target compatibility = 17"
grep -r "jvmTarget.*17" build.gradle && echo "PASS: Kotlin JVM target = 17"

# Step 3: Verify Gradle wrapper version
./gradlew --version | grep "Gradle" | awk '{if ($2 >= 7.5) print "PASS: Gradle " $2 " (supports JDK 17+)"; else print "WARNING: Gradle " $2 " may not fully support JDK 17+"}'

# Step 4: Check Android Gradle Plugin version
grep -r "com.android.tools.build:gradle" build.gradle | grep -oP ':\K[0-9.]+' | awk '{if ($1 >= 7.3) print "PASS: AGP " $1 " (supports JDK 17+)"; else print "WARNING: AGP " $1 " may need JDK 11"}'
```

---

## 4. Comprehensive Build Verification

### 4.1 Progressive Build Tests

```bash
#!/bin/bash
# Comprehensive Build Test Suite

echo "=== JDK 17+ Build Validation Test Suite ==="

# Phase 1: Pre-build checks
echo -e "\n[Phase 1] Pre-build System Checks"
java -version && echo "✓ Java runtime accessible" || exit 1
javac -version && echo "✓ Java compiler accessible" || exit 1
[ -n "$JAVA_HOME" ] && echo "✓ JAVA_HOME set" || echo "⚠ JAVA_HOME not set"

# Phase 2: Gradle wrapper
echo -e "\n[Phase 2] Gradle Wrapper Validation"
cd src/android
./gradlew --version && echo "✓ Gradle wrapper functional" || exit 1
./gradlew -version 2>&1 | grep "JVM:" | awk '{print "  Gradle JVM: " $2}'

# Phase 3: Dependency resolution
echo -e "\n[Phase 3] Dependency Resolution"
./gradlew dependencies --configuration implementation >/dev/null 2>&1 && echo "✓ Implementation dependencies resolved" || echo "✗ Dependency resolution failed"

# Phase 4: Task execution
echo -e "\n[Phase 4] Gradle Task Execution"
./gradlew tasks >/dev/null 2>&1 && echo "✓ Gradle tasks listed" || echo "✗ Task listing failed"

# Phase 5: Compilation test
echo -e "\n[Phase 5] Compilation Test"
./gradlew compileDebugKotlin --dry-run && echo "✓ Kotlin compilation plan succeeds" || echo "✗ Compilation planning failed"
./gradlew compileDebugJavaWithJavac --dry-run && echo "✓ Java compilation plan succeeds" || echo "✗ Java compilation planning failed"

# Phase 6: Build dry run
echo -e "\n[Phase 6] Build Dry Run"
./gradlew assembleDebug --dry-run && echo "✓ Debug build plan succeeds" || echo "✗ Build planning failed"

# Phase 7: Clean build (optional - actual build)
echo -e "\n[Phase 7] Clean Build (Optional - Comment out if not desired)"
# ./gradlew clean assembleDebug && echo "✓ Debug build succeeds" || echo "✗ Build failed"

echo -e "\n=== Test Suite Complete ==="
```

### 4.2 Continuous Integration Validation

```bash
# CI/CD Validation Script
# Ensures JDK 17+ is configured correctly in CI environment

#!/bin/bash
set -e  # Exit on any error

echo "=== CI/CD JDK Validation ==="

# Test 1: JDK installed
java -version 2>&1 | grep -q "version" || { echo "FAIL: Java not installed"; exit 1; }

# Test 2: JDK version >= 17
JAVA_VER=$(java -version 2>&1 | grep -oP 'version "\K\d+')
[ "$JAVA_VER" -ge 17 ] || { echo "FAIL: Java $JAVA_VER < 17"; exit 1; }
echo "PASS: Java $JAVA_VER >= 17"

# Test 3: JAVA_HOME set
[ -n "$JAVA_HOME" ] || { echo "FAIL: JAVA_HOME not set"; exit 1; }
echo "PASS: JAVA_HOME = $JAVA_HOME"

# Test 4: Gradle wrapper works
cd src/android
./gradlew --version || { echo "FAIL: Gradle wrapper failed"; exit 1; }

# Test 5: Build succeeds
./gradlew assembleDebug || { echo "FAIL: Build failed"; exit 1; }
echo "PASS: Build succeeded"

echo "=== CI/CD Validation Complete ==="
```

---

## 5. Success Criteria Checklist

### System Level
- [ ] JDK 17 or higher installed on system
- [ ] `java -version` returns version >= 17
- [ ] `javac -version` returns version >= 17
- [ ] JAVA_HOME environment variable set correctly
- [ ] JAVA_HOME points to JDK 17+ installation
- [ ] JAVA_HOME/bin/java is executable
- [ ] PATH includes JAVA_HOME/bin

### IDE Level
- [ ] IDE (Android Studio/IntelliJ) detects JDK 17+
- [ ] Project SDK is set to JDK 17+
- [ ] Gradle JDK setting in IDE is JDK 17+
- [ ] IDE can compile Java 17 code
- [ ] No JDK-related warnings in IDE

### Project Level
- [ ] build.gradle has sourceCompatibility = JavaVersion.VERSION_17
- [ ] build.gradle has targetCompatibility = JavaVersion.VERSION_17
- [ ] Kotlin jvmTarget = '17' in build.gradle
- [ ] Gradle wrapper version >= 7.5
- [ ] Android Gradle Plugin version >= 7.3

### Build Level
- [ ] `./gradlew --version` shows JVM version >= 17
- [ ] `./gradlew tasks` completes successfully
- [ ] `./gradlew dependencies` resolves all dependencies
- [ ] `./gradlew assembleDebug --dry-run` succeeds
- [ ] `./gradlew clean assembleDebug` builds successfully
- [ ] No JDK-related errors in build output

---

## 6. Automated Validation Script

```bash
#!/bin/bash
# master-jdk-validation.sh
# Comprehensive JDK 17+ validation for EMR Integration Platform

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR/../.."
ANDROID_DIR="$PROJECT_ROOT/src/android"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

pass() { echo -e "${GREEN}✓${NC} $1"; ((PASS_COUNT++)); }
fail() { echo -e "${RED}✗${NC} $1"; ((FAIL_COUNT++)); }
warn() { echo -e "${YELLOW}⚠${NC} $1"; ((WARN_COUNT++)); }

echo "======================================"
echo "  JDK 17+ Validation Test Suite"
echo "======================================"

# ===== SYSTEM LEVEL TESTS =====
echo -e "\n[SYSTEM LEVEL]"

# Test: Java runtime
if command -v java &> /dev/null; then
  JAVA_VER=$(java -version 2>&1 | grep -oP 'version "\K\d+')
  if [ "$JAVA_VER" -ge 17 ]; then
    pass "Java runtime version $JAVA_VER (>= 17)"
  else
    fail "Java runtime version $JAVA_VER (< 17 REQUIRED)"
  fi
else
  fail "Java runtime not found"
fi

# Test: Java compiler
if command -v javac &> /dev/null; then
  JAVAC_VER=$(javac -version 2>&1 | grep -oP 'javac \K\d+')
  if [ "$JAVAC_VER" -ge 17 ]; then
    pass "Java compiler version $JAVAC_VER (>= 17)"
  else
    fail "Java compiler version $JAVAC_VER (< 17 REQUIRED)"
  fi
else
  fail "Java compiler not found"
fi

# Test: JAVA_HOME
if [ -n "$JAVA_HOME" ]; then
  if [ -d "$JAVA_HOME" ]; then
    if [ -f "$JAVA_HOME/bin/java" ]; then
      HOME_VER=$("$JAVA_HOME/bin/java" -version 2>&1 | grep -oP 'version "\K\d+')
      if [ "$HOME_VER" -ge 17 ]; then
        pass "JAVA_HOME points to JDK $HOME_VER (>= 17)"
      else
        fail "JAVA_HOME points to JDK $HOME_VER (< 17)"
      fi
    else
      fail "JAVA_HOME/bin/java not found"
    fi
  else
    fail "JAVA_HOME directory does not exist"
  fi
else
  warn "JAVA_HOME not set (may use system default)"
fi

# ===== IDE LEVEL TESTS =====
echo -e "\n[IDE LEVEL]"

if [ -f "$PROJECT_ROOT/.idea/misc.xml" ]; then
  if grep -q "jdk-1[7-9]\|jdk-2[0-9]" "$PROJECT_ROOT/.idea/misc.xml" 2>/dev/null; then
    pass "IDE project SDK configured for JDK 17+"
  else
    warn "IDE project SDK may not be JDK 17+ (check manually)"
  fi
else
  warn "No .idea/misc.xml found (not using IntelliJ/Android Studio?)"
fi

# ===== PROJECT LEVEL TESTS =====
echo -e "\n[PROJECT LEVEL]"

if [ -f "$ANDROID_DIR/build.gradle" ]; then
  # Check source compatibility
  if grep -q "sourceCompatibility.*17\|VERSION_17" "$ANDROID_DIR/build.gradle"; then
    pass "Source compatibility set to Java 17"
  else
    fail "Source compatibility not set to Java 17"
  fi

  # Check target compatibility
  if grep -q "targetCompatibility.*17\|VERSION_17" "$ANDROID_DIR/build.gradle"; then
    pass "Target compatibility set to Java 17"
  else
    fail "Target compatibility not set to Java 17"
  fi

  # Check Kotlin JVM target
  if grep -q "jvmTarget.*17\|jvmTarget = '17'" "$ANDROID_DIR/build.gradle" "$ANDROID_DIR/app/build.gradle" 2>/dev/null; then
    pass "Kotlin JVM target set to 17"
  else
    fail "Kotlin JVM target not set to 17"
  fi
else
  fail "build.gradle not found in $ANDROID_DIR"
fi

# ===== BUILD LEVEL TESTS =====
echo -e "\n[BUILD LEVEL]"

if [ -f "$ANDROID_DIR/gradlew" ]; then
  cd "$ANDROID_DIR"

  # Test: Gradle wrapper
  if ./gradlew --version &> /dev/null; then
    GRADLE_JVM=$(./gradlew -version 2>&1 | grep "JVM:" | awk '{print $2}' | cut -d'.' -f1)
    if [ "$GRADLE_JVM" -ge 17 ]; then
      pass "Gradle uses JVM $GRADLE_JVM (>= 17)"
    else
      fail "Gradle uses JVM $GRADLE_JVM (< 17 REQUIRED)"
    fi
  else
    fail "Gradle wrapper failed to execute"
  fi

  # Test: Task listing
  if ./gradlew tasks &> /dev/null; then
    pass "Gradle can list tasks"
  else
    fail "Gradle task listing failed"
  fi

  # Test: Dependency resolution (dry run)
  if timeout 60 ./gradlew dependencies --configuration implementation &> /dev/null; then
    pass "Gradle can resolve dependencies"
  else
    warn "Dependency resolution timed out or failed (may need network)"
  fi

  # Test: Build dry run
  if ./gradlew assembleDebug --dry-run &> /dev/null; then
    pass "Build dry-run succeeds"
  else
    fail "Build dry-run failed"
  fi

else
  fail "Gradle wrapper not found in $ANDROID_DIR"
fi

# ===== SUMMARY =====
echo -e "\n======================================"
echo "  VALIDATION SUMMARY"
echo "======================================"
echo -e "${GREEN}Passed:${NC} $PASS_COUNT"
echo -e "${YELLOW}Warnings:${NC} $WARN_COUNT"
echo -e "${RED}Failed:${NC} $FAIL_COUNT"

if [ $FAIL_COUNT -eq 0 ]; then
  echo -e "\n${GREEN}✓ All critical tests passed!${NC}"
  exit 0
else
  echo -e "\n${RED}✗ Some tests failed. Please fix the issues above.${NC}"
  exit 1
fi
```

---

## 7. Recommended Testing Workflow

### Phase 1: Diagnosis (Current State)
1. Run system-level validation commands
2. Identify which scenario applies
3. Document current environment state

### Phase 2: Solution Application
1. Apply fix (install JDK, configure JAVA_HOME, etc.)
2. Run relevant scenario validation tests
3. Document what was changed

### Phase 3: Verification
1. Run comprehensive validation script
2. Test IDE integration (if applicable)
3. Perform project-level build test
4. Execute full build (assembleDebug)

### Phase 4: Regression Testing
1. Verify other projects still build (if multi-project setup)
2. Test CI/CD pipeline (if applicable)
3. Ensure no version conflicts introduced

### Phase 5: Documentation
1. Record final configuration
2. Update team documentation
3. Create reproducible setup guide

---

## 8. Common Pitfalls and Their Tests

### Pitfall 1: JAVA_HOME set but PATH not updated
**Test**: `which java` vs `$JAVA_HOME/bin/java`
**Fix**: Add `export PATH="$JAVA_HOME/bin:$PATH"` to shell config

### Pitfall 2: IDE uses different JDK than command line
**Test**: Compare IDE build output with `./gradlew assembleDebug`
**Fix**: Sync IDE JDK settings with JAVA_HOME

### Pitfall 3: Gradle daemon uses old JDK
**Test**: `./gradlew --status` and check JDK version
**Fix**: `./gradlew --stop` to restart daemon with new JDK

### Pitfall 4: macOS using system Java instead of JAVA_HOME
**Test**: `/usr/libexec/java_home` vs `echo $JAVA_HOME`
**Fix**: Ensure JAVA_HOME is set in shell config, not just inline

### Pitfall 5: Android Gradle Plugin version incompatible
**Test**: AGP version vs JDK version compatibility matrix
**Fix**: Update AGP to version that supports JDK 17+ (>= 7.3)

---

## 9. Continuous Monitoring

### Post-Fix Health Checks
```bash
# Daily build health check
./gradlew clean assembleDebug && echo "✓ Build healthy"

# Weekly JDK verification
java -version | grep -q "version \"1[7-9]\|version \"2[0-9]" && echo "✓ JDK still 17+"

# Pre-commit hook (optional)
#!/bin/bash
# .git/hooks/pre-commit
java -version 2>&1 | grep -qP 'version "1[7-9]|version "2[0-9]' || {
  echo "ERROR: JDK 17+ required"
  exit 1
}
```

---

## 10. Rollback Plan

If JDK 17+ installation causes issues:

```bash
# 1. Identify previous JDK version
/usr/libexec/java_home -V

# 2. Revert JAVA_HOME (temporarily)
export JAVA_HOME=$(/usr/libexec/java_home -v 11)  # or previous version

# 3. Restart Gradle daemon
cd src/android && ./gradlew --stop

# 4. Test previous configuration
./gradlew assembleDebug

# 5. Document issue and create bug report
```

---

## Appendix A: Platform-Specific Commands

### macOS
```bash
# List JDKs
/usr/libexec/java_home -V

# Set JAVA_HOME (Zsh)
echo 'export JAVA_HOME=$(/usr/libexec/java_home -v 17)' >> ~/.zshrc

# Install JDK 17 (Homebrew)
brew install openjdk@17
```

### Linux (Ubuntu/Debian)
```bash
# List JDKs
update-java-alternatives --list

# Install JDK 17
sudo apt-get update
sudo apt-get install openjdk-17-jdk

# Set JAVA_HOME
echo 'export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64' >> ~/.bashrc
```

### Windows
```powershell
# Check Java version
java -version

# Set JAVA_HOME
setx JAVA_HOME "C:\Program Files\Java\jdk-17"

# Verify
echo %JAVA_HOME%
```

---

**Document Version**: 1.0
**Last Updated**: 2025-11-14
**Validated By**: Tester Agent
**Status**: Ready for Swarm Review
