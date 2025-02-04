@rem
@rem EMR Task Management System - Gradle Wrapper Script for Windows
@rem Version: 7.5
@rem Copyright 2023. Licensed under the project terms.
@rem

@if "%DEBUG%" == "" @echo off
@rem ##########################################################################
@rem
@rem  Gradle startup script for Windows
@rem
@rem ##########################################################################

@rem Set local scope for variables
setlocal enabledelayedexpansion
setlocal enableextensions

@rem Configure default JVM options optimized for EMR Task builds
set DEFAULT_JVM_OPTS="-Xmx2048m" "-Xms512m" "-XX:MaxMetaspaceSize=512m" "-XX:+HeapDumpOnOutOfMemoryError" "-Dfile.encoding=UTF-8"

set DIRNAME=%~dp0
if "%DIRNAME%" == "" set DIRNAME=.

@rem Detect and handle long paths
if not "%DIRNAME:~0,4%" == "\\?\" (
    set DIRNAME=\\?\%DIRNAME%
)

set APP_BASE_NAME=%~n0
set APP_HOME=%DIRNAME%

@rem Validate and locate Java installation
:findJavaFromJavaHome
set JAVA_HOME=%JAVA_HOME:"=%
if defined JAVA_HOME (
    if exist "%JAVA_HOME%\bin\java.exe" (
        set JAVA_EXE=%JAVA_HOME%\bin\java.exe
        goto validateJava
    )
)

:findJavaFromPath
set JAVA_EXE=java.exe
if not defined JAVA_EXE (
    echo ERROR: JAVA_EXE not found in PATH
    exit /b 1
)

:validateJava
"%JAVA_EXE%" -version >NUL 2>&1
if "%ERRORLEVEL%" == "0" goto validateGradle
echo ERROR: Java validation failed
exit /b 1

:validateGradle
@rem Setup the command line arguments for Gradle execution
set CLASSPATH=%APP_HOME%\gradle\wrapper\gradle-wrapper.jar

@rem Validate gradle-wrapper.jar exists
if not exist "%CLASSPATH%" (
    echo ERROR: Gradle wrapper JAR not found at: %CLASSPATH%
    exit /b 1
)

@rem Configure Gradle environment
if not defined GRADLE_OPTS (
    set GRADLE_OPTS="-Dorg.gradle.daemon=true" "-Dorg.gradle.parallel=true" "-Dorg.gradle.configureondemand=true" "-Dorg.gradle.jvmargs=-Xmx2048m"
)

@rem Execute Gradle with enhanced error handling
:execute
@rem Escape quotes in arguments to handle spaces correctly
set CMD_LINE_ARGS=
set _SKIP=2

:win9xME_args_slurp
if "x%~1" == "x" goto execute

set CMD_LINE_ARGS=%*

:execute
"%JAVA_EXE%" %DEFAULT_JVM_OPTS% %JAVA_OPTS% %GRADLE_OPTS% "-Dorg.gradle.appname=%APP_BASE_NAME%" -classpath "%CLASSPATH%" org.gradle.wrapper.GradleWrapperMain %CMD_LINE_ARGS%

:end
@rem Return the exit code from the Gradle execution
if "%ERRORLEVEL%"=="0" goto mainEnd

:fail
rem Set variable GRADLE_EXIT_CONSOLE if you need the _script_ return code instead of
rem the _cmd.exe /c_ return code!
if  not "" == "%GRADLE_EXIT_CONSOLE%" exit 1
exit /b 1

:mainEnd
if "%OS%"=="Windows_NT" endlocal

:omega