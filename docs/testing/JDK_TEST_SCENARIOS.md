# JDK 17+ Test Scenarios and Execution Plan

## Overview
Comprehensive test scenarios for validating JDK 17+ requirement for the EMR Integration Platform Android build system.

---

## Current Environment Analysis

**System**: macOS (Darwin 25.0.0)
**JDK Status**: NOT INSTALLED
**JAVA_HOME**: Not set
**Project Requirement**: JDK 17+ for Android Gradle Plugin 8.0.0 and Kotlin 1.8.0

---

## Test Scenario Matrix

| Scenario | JDK State | JAVA_HOME | Expected Result | Test Priority |
|----------|-----------|-----------|-----------------|---------------|
| 1 | Not installed | Not set | Build fails | CRITICAL (CURRENT) |
| 2 | JDK 11 installed | Points to JDK 11 | Build fails with version error | HIGH |
| 3 | JDK 17+ installed | Not set | Build may work with system default | MEDIUM |
| 4 | JDK 17+ installed | Correctly set | Build succeeds | TARGET STATE |
| 5 | Multiple JDKs | Points to JDK 11 | Build fails | HIGH |
| 6 | JDK 17+ installed | Points to JDK 11 | Build fails | HIGH |
| 7 | JDK 17+ installed | Malformed path | Build fails | MEDIUM |
| 8 | JDK 17+ in CI/CD | Environment-specific | Build must succeed | CRITICAL |

---

## Scenario 1: JDK Not Installed (CURRENT STATE)

### Pre-conditions
- No Java installation on system
- JAVA_HOME not set
- Gradle build files require JDK 17+

### Test Steps
```bash
# Step 1: Verify no Java
java -version
# Expected: "Unable to locate a Java Runtime"

# Step 2: Verify no JAVA_HOME
echo $JAVA_HOME
# Expected: Empty output

# Step 3: Check for JDK installations (macOS)
/usr/libexec/java_home -V
# Expected: "Unable to find any JVMs"

# Step 4: Attempt Gradle build
cd src/android
./gradlew assembleDebug
# Expected: Error about missing JDK
```

### Expected Behavior
- All Java commands fail
- Gradle wrapper cannot execute (may download but can't run)
- Clear error message about missing Java runtime

### Validation Criteria
- [ ] `java -version` returns error
- [ ] `javac -version` returns error or "command not found"
- [ ] `echo $JAVA_HOME` returns empty
- [ ] Gradle build fails with JDK requirement error

### Success Metrics
- Error messages clearly indicate missing JDK
- No ambiguous or misleading errors
- Build fails fast (within 5 seconds)

---

## Scenario 2: JDK < 17 Installed

### Pre-conditions
- JDK 11 (or any version < 17) installed
- JAVA_HOME may or may not be set
- Android Gradle Plugin requires JDK 17+

### Test Steps
```bash
# Step 1: Install JDK 11 (for testing)
# macOS: brew install openjdk@11
# Linux: sudo apt install openjdk-11-jdk

# Step 2: Set JAVA_HOME to JDK 11
export JAVA_HOME=$(/usr/libexec/java_home -v 11)  # macOS
# or
export JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64  # Linux

# Step 3: Verify version
java -version
# Expected: openjdk version "11.0.x"

# Step 4: Attempt Gradle build
cd src/android
./gradlew assembleDebug
# Expected: Error about Java version incompatibility
```

### Expected Behavior
- Java commands work but show version 11
- Gradle detects JDK 11
- Build fails with clear version requirement error
- Error message specifies "Requires Java 17 but found Java 11"

### Validation Criteria
- [ ] `java -version` shows version 11
- [ ] `./gradlew --version` shows JVM 11
- [ ] Build fails with version mismatch error
- [ ] Error message is actionable (tells user to upgrade)

### Common Error Messages
```
> Failed to apply plugin 'com.android.application'.
> Android Gradle plugin requires Java 17 to run. You are currently using Java 11.
```

### Success Metrics
- Clear indication of version mismatch
- Specific version requirement stated (17+)
- Suggestion to upgrade JDK

---

## Scenario 3: JDK 17+ Installed but JAVA_HOME Not Set

### Pre-conditions
- JDK 17+ installed on system
- JAVA_HOME environment variable not set
- System uses default Java

### Test Steps
```bash
# Step 1: Install JDK 17+
# macOS: brew install openjdk@17
# Linux: sudo apt install openjdk-17-jdk

# Step 2: Verify installation
/usr/libexec/java_home -V  # macOS
# or
update-java-alternatives --list  # Linux

# Step 3: Ensure JAVA_HOME is NOT set
unset JAVA_HOME
echo $JAVA_HOME
# Expected: Empty

# Step 4: Check if java command works
java -version
# Expected: May work if JDK 17 is system default

# Step 5: Attempt Gradle build
cd src/android
./gradlew assembleDebug
# Expected: May succeed or fail depending on system PATH
```

### Expected Behavior
- JDK 17+ is installed but not explicitly configured
- Gradle may or may not find correct JDK
- Build result depends on system default Java version
- Potential for inconsistent behavior across environments

### Validation Criteria
- [ ] JDK 17+ exists in standard location
- [ ] `java -version` shows correct version IF in PATH
- [ ] JAVA_HOME is empty
- [ ] Build behavior is environment-dependent

### Risk Factors
- Different behavior in IDE vs command line
- Different behavior in CI/CD vs local machine
- Gradle daemon may cache old JDK version

### Success Metrics
- IF build succeeds, it's using JDK 17+ (verify with ./gradlew -version)
- IF build fails, error clearly indicates missing JAVA_HOME

---

## Scenario 4: JDK 17+ Properly Configured (TARGET STATE)

### Pre-conditions
- JDK 17+ installed
- JAVA_HOME set to JDK 17+ path
- JAVA_HOME/bin in PATH
- All environment variables persisted in shell config

### Test Steps
```bash
# Step 1: Install JDK 17+
# macOS: brew install openjdk@17
# Linux: sudo apt install openjdk-17-jdk

# Step 2: Set JAVA_HOME persistently
echo 'export JAVA_HOME=$(/usr/libexec/java_home -v 17)' >> ~/.zshrc  # macOS
echo 'export PATH="$JAVA_HOME/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Step 3: Verify configuration
echo $JAVA_HOME
java -version
javac -version

# Step 4: Verify Gradle sees correct JDK
cd src/android
./gradlew -version

# Step 5: Build project
./gradlew clean assembleDebug

# Step 6: Verify in new shell
/bin/zsh -c 'echo $JAVA_HOME'
/bin/zsh -c 'java -version'
```

### Expected Behavior
- All Java commands work
- Version 17+ consistently reported
- JAVA_HOME persists across shell sessions
- Gradle uses correct JDK
- Build succeeds

### Validation Criteria
- [x] `java -version` shows JDK 17+
- [x] `javac -version` shows JDK 17+
- [x] `echo $JAVA_HOME` shows valid path
- [x] `$JAVA_HOME/bin/java -version` shows JDK 17+
- [x] `./gradlew -version` shows JVM 17+
- [x] `./gradlew assembleDebug` succeeds
- [x] New shell inherits JAVA_HOME
- [x] IDE detects JDK 17+ (if applicable)

### Success Metrics
- 100% test pass rate
- Build completes in reasonable time
- No JDK-related warnings or errors
- Consistent behavior across all environments

---

## Scenario 5: Multiple JDK Versions Installed

### Pre-conditions
- Multiple JDKs installed (e.g., JDK 11, 17, 21)
- JAVA_HOME points to wrong version
- Potential for version conflicts

### Test Steps
```bash
# Step 1: Verify multiple JDKs
/usr/libexec/java_home -V
# Expected: List of multiple JDK versions

# Step 2: Set JAVA_HOME to wrong version
export JAVA_HOME=$(/usr/libexec/java_home -v 11)

# Step 3: Verify version mismatch
java -version  # Shows JDK 11
./gradlew -version  # May show JDK 11

# Step 4: Attempt build
cd src/android
./gradlew assembleDebug
# Expected: Fails with version error

# Step 5: Switch to correct JDK
export JAVA_HOME=$(/usr/libexec/java_home -v 17)

# Step 6: Restart Gradle daemon
./gradlew --stop

# Step 7: Retry build
./gradlew assembleDebug
# Expected: Should succeed now
```

### Expected Behavior
- Multiple JDKs cause potential confusion
- JAVA_HOME determines which JDK is used
- Gradle daemon caches JDK selection
- Switching JDK requires daemon restart

### Validation Criteria
- [ ] Multiple JDKs detected by java_home
- [ ] JAVA_HOME can be switched between versions
- [ ] Gradle daemon must be restarted after JDK switch
- [ ] Build succeeds only with JDK 17+

### Common Pitfalls
- Gradle daemon uses old JDK after switch
- IDE uses different JDK than command line
- PATH includes multiple JDK bin directories

### Success Metrics
- Ability to explicitly select JDK 17+
- Build succeeds after correct configuration
- No residual effects from other JDK versions

---

## Scenario 6: JDK 17+ Installed but JAVA_HOME Points to JDK 11

### Pre-conditions
- Both JDK 11 and JDK 17+ installed
- JAVA_HOME explicitly set to JDK 11
- System PATH includes JAVA_HOME/bin

### Test Steps
```bash
# Step 1: Verify both JDKs exist
/usr/libexec/java_home -v 11
/usr/libexec/java_home -v 17

# Step 2: Set JAVA_HOME to JDK 11
export JAVA_HOME=$(/usr/libexec/java_home -v 11)

# Step 3: Verify mismatch
java -version  # Shows 11
echo $JAVA_HOME  # Points to JDK 11

# Step 4: Build fails
cd src/android
./gradlew assembleDebug
# Expected: Version mismatch error

# Step 5: Fix by updating JAVA_HOME
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
./gradlew --stop  # Restart daemon
./gradlew assembleDebug
# Expected: Succeeds
```

### Expected Behavior
- JAVA_HOME override takes precedence
- Build fails with JDK 11
- Explicit JAVA_HOME change fixes issue
- Daemon restart required

### Validation Criteria
- [ ] JAVA_HOME points to JDK 11 initially
- [ ] Build fails with version error
- [ ] Changing JAVA_HOME to JDK 17+ fixes issue
- [ ] Daemon restart is necessary

### Success Metrics
- Clear understanding of JAVA_HOME priority
- Successful JAVA_HOME update
- Build succeeds after fix

---

## Scenario 7: Malformed JAVA_HOME

### Pre-conditions
- JDK 17+ installed
- JAVA_HOME set to invalid or malformed path

### Test Steps
```bash
# Step 1: Set invalid JAVA_HOME
export JAVA_HOME="/invalid/path/to/jdk"

# Step 2: Verify path is invalid
ls $JAVA_HOME
# Expected: No such file or directory

# Step 3: Check java command
java -version
# May work if /usr/bin/java exists, but shows wrong version

# Step 4: Attempt build
cd src/android
./gradlew assembleDebug
# Expected: Error about JDK not found

# Step 5: Fix JAVA_HOME
export JAVA_HOME=$(/usr/libexec/java_home -v 17)

# Step 6: Verify fix
ls $JAVA_HOME/bin/java
./gradlew --stop
./gradlew assembleDebug
```

### Expected Behavior
- Invalid JAVA_HOME causes build failure
- Error message may be cryptic
- Fixing JAVA_HOME resolves issue

### Validation Criteria
- [ ] Invalid JAVA_HOME causes build failure
- [ ] Error indicates JDK not found or invalid
- [ ] Correcting JAVA_HOME fixes issue

### Common Malformations
- Trailing slash in path
- Path to JRE instead of JDK
- Path to old/moved JDK installation
- Typos in path

### Success Metrics
- Ability to detect invalid JAVA_HOME
- Clear error messages
- Quick resolution via correct path

---

## Scenario 8: CI/CD Environment

### Pre-conditions
- Automated build environment
- JDK must be installed in CI pipeline
- Environment variables must be set correctly

### Test Steps
```bash
# Step 1: CI/CD setup script
#!/bin/bash
set -e

# Install JDK 17
if [[ "$OSTYPE" == "darwin"* ]]; then
  brew install openjdk@17
  export JAVA_HOME=$(/usr/libexec/java_home -v 17)
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  sudo apt-get update
  sudo apt-get install -y openjdk-17-jdk
  export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
fi

export PATH="$JAVA_HOME/bin:$PATH"

# Verify setup
java -version
./gradlew -version

# Build
cd src/android
./gradlew clean assembleDebug

# Step 2: Verify build artifacts
ls -lh app/build/outputs/apk/debug/
```

### Expected Behavior
- JDK installation succeeds in CI
- Environment variables set correctly
- Build succeeds
- Artifacts generated

### Validation Criteria
- [ ] CI job succeeds
- [ ] JDK 17+ installed
- [ ] JAVA_HOME set correctly
- [ ] Build completes
- [ ] APK generated

### CI/CD Platforms
- GitHub Actions: Use `setup-java@v3` action
- GitLab CI: Use `openjdk:17` Docker image
- CircleCI: Use `cimg/android:2023.08` with JDK 17
- Jenkins: Install JDK 17 via Jenkins tools

### Success Metrics
- 100% CI build success rate
- Consistent build times
- Reproducible builds
- Artifact generation

---

## Test Execution Workflow

### Phase 1: Initial Diagnosis
1. Run `/scripts/validate-jdk.sh`
2. Identify current scenario (likely Scenario 1)
3. Document baseline state

### Phase 2: Apply Solution
1. Install JDK 17+ using platform-specific method
2. Configure JAVA_HOME
3. Update shell configuration for persistence

### Phase 3: Validation
1. Re-run `/scripts/validate-jdk.sh`
2. Verify all checks pass
3. Test actual build: `./gradlew assembleDebug`

### Phase 4: Regression Testing
1. Open new terminal and verify JAVA_HOME persists
2. Test IDE integration (if applicable)
3. Verify CI/CD pipeline (if applicable)

### Phase 5: Documentation
1. Record final configuration
2. Update team setup guide
3. Document any platform-specific gotchas

---

## Automated Test Execution

```bash
#!/bin/bash
# test-all-scenarios.sh
# Execute all JDK test scenarios (requires JDK installation/uninstallation capabilities)

echo "=== JDK Test Scenario Execution ==="

# Scenario 1: Already in this state (no JDK)
echo -e "\n[Scenario 1] Testing: No JDK installed"
unset JAVA_HOME
./scripts/validate-jdk.sh && echo "UNEXPECTED: Should fail" || echo "✓ Failed as expected"

# Scenario 4: Target state (install JDK 17+)
echo -e "\n[Scenario 4] Testing: JDK 17+ properly configured"
brew install openjdk@17  # macOS
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export PATH="$JAVA_HOME/bin:$PATH"
./scripts/validate-jdk.sh && echo "✓ Passed as expected" || echo "✗ FAILED: Should pass"

# Additional scenarios require manual JDK version switching
echo -e "\n=== Manual Testing Required ==="
echo "Scenario 2: Install JDK 11 and test"
echo "Scenario 5: Install multiple JDKs and test switching"
echo "Scenario 7: Set invalid JAVA_HOME and test"
```

---

## Success Criteria Summary

### System Level
- JDK 17+ installed and accessible via `java -version`
- JAVA_HOME correctly configured and persistent
- All shell sessions inherit correct environment

### Build Level
- Gradle detects JDK 17+
- Build completes without JDK-related errors
- Artifacts generated successfully

### Integration Level
- IDE recognizes JDK 17+
- CI/CD pipeline builds successfully
- Consistent behavior across all environments

### User Experience
- Clear error messages when misconfigured
- Fast feedback (errors within seconds)
- Actionable guidance in error messages

---

## Risk Mitigation

### Risk 1: Gradle Daemon Caching Old JDK
**Mitigation**: Always run `./gradlew --stop` after changing JAVA_HOME

### Risk 2: IDE Uses Different JDK
**Mitigation**: Explicitly set Gradle JDK in IDE settings

### Risk 3: CI/CD Environment Differences
**Mitigation**: Use Docker images with pre-installed JDK 17+

### Risk 4: Multiple Team Members, Different Setups
**Mitigation**: Provide automated setup script and validation script

---

**Document Version**: 1.0
**Last Updated**: 2025-11-14
**Related Documents**:
- `/docs/testing/JDK_VALIDATION_STRATEGY.md`
- `/scripts/validate-jdk.sh`
