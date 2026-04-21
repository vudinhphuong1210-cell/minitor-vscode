# =============================================================================
# EDU Monitor - Manual API Test Script
# Run from: edu-monitor/ directory
# Usage:    .\test-manual.ps1
# =============================================================================

$BASE = "http://localhost:3000"
$PASS = 0
$FAIL = 0

# --- CONFIGURATION (Tài khoản để chạy test) ---
$STUDENT_EMAIL    = "student@edu.local"
$INSTRUCTOR_EMAIL = "instructor@edu.local"
$PASSWORD         = "admin1234"
# ----------------------------------------------

function Print-Header($title) {
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host "  $title" -ForegroundColor Cyan
    Write-Host ("=" * 60) -ForegroundColor Cyan
}

function Print-Step($msg) {
    Write-Host ""
    Write-Host ">> $msg" -ForegroundColor Yellow
}

function Assert-Ok($label, $condition, $detail) {
    if ($condition) {
        Write-Host "  [PASS]  $label" -ForegroundColor Green
        $script:PASS++
    } else {
        Write-Host "  [FAIL]  $label  $detail" -ForegroundColor Red
        $script:FAIL++
    }
}

function Invoke-API($method, $path, $body, $token) {
    $headers = @{ "Content-Type" = "application/json" }
    if ($token) { $headers["Authorization"] = "Bearer $token" }
    try {
        $params = @{
            Uri         = "$BASE$path"
            Method      = $method
            Headers     = $headers
            ErrorAction = "Stop"
        }
        if ($body) { $params["Body"] = ($body | ConvertTo-Json -Depth 10) }
        $resp = Invoke-RestMethod @params
        return @{ ok = $true; data = $resp; status = 200 }
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        try   { $errMsg = ($_.ErrorDetails.Message | ConvertFrom-Json).error }
        catch { $errMsg = $_.Exception.Message }
        return @{ ok = $false; data = $null; status = $status; error = $errMsg }
    }
}

# =============================================================================
Print-Header "0. HEALTH CHECK"
# =============================================================================
Print-Step "GET /health"
$r = Invoke-API "GET" "/health"
Assert-Ok "Server is up" ($r.ok -and $r.data.status -eq "ok")

# =============================================================================
Print-Header "1. AUTH - REGISTER AND LOGIN"
# =============================================================================

Print-Step "Auth Setup (Register/Login)"

# 1a. Thử đăng ký student (bỏ qua nếu đã có)
$r = Invoke-API "POST" "/api/auth/register" @{
    email        = $STUDENT_EMAIL
    display_name = "Test Student"
    password     = $PASSWORD
    role         = "student"
}
if ($r.ok) { Write-Host "  [OK] Registered new student" -ForegroundColor Gray }

# 1b. Đăng nhập student để lấy ID và Token
$r = Invoke-API "POST" "/api/auth/login" @{ email = $STUDENT_EMAIL; password = $PASSWORD }
Assert-Ok "Login student 200" ($r.ok)
Assert-Ok "Token returned"    ($null -ne $r.data.token)
$STUDENT_TOKEN = $r.data.token
$STUDENT_ID    = $r.data.user.id

# 1c. Thử đăng ký instructor (bỏ qua nếu đã có)
$r = Invoke-API "POST" "/api/auth/register" @{
    email        = $INSTRUCTOR_EMAIL
    display_name = "Test Instructor"
    password     = $PASSWORD
    role         = "instructor"
}
if ($r.ok) { Write-Host "  [OK] Registered new instructor" -ForegroundColor Gray }

# 1d. Đăng nhập instructor
$r = Invoke-API "POST" "/api/auth/login" @{ email = $INSTRUCTOR_EMAIL; password = $PASSWORD }
Assert-Ok "Login instructor 200" ($r.ok)
$INSTRUCTOR_TOKEN = $r.data.token

Print-Step "POST /api/auth/login (wrong password - expect 401)"
$r = Invoke-API "POST" "/api/auth/login" @{ email = $STUDENT_EMAIL; password = "wrongpass" }
Assert-Ok "Wrong password -> 401" ($r.status -eq 401)

Print-Step "GET /api/dashboard/students (no token - expect 401)"
$r = Invoke-API "GET" "/api/dashboard/students"
Assert-Ok "No token -> 401" ($r.status -eq 401)

# =============================================================================
Print-Header "2. EVENTS - BATCH SUBMIT"
# =============================================================================

$SESSION_ID = [System.Guid]::NewGuid().ToString()
$NOW        = [DateTime]::UtcNow.ToString("o")

Print-Step "POST /api/events/batch (3 events)"
$r = Invoke-API "POST" "/api/events/batch" @{
    events = @(
        @{
            session_id = $SESSION_ID
            event_type = "session_start"
            payload    = @{ editor = "vscode" }
            client_ts  = $NOW
            prev_hash  = $null
        },
        @{
            session_id = $SESSION_ID
            event_type = "keystroke"
            payload    = @{ key = "a"; line = 1 }
            client_ts  = $NOW
            prev_hash  = $null
        },
        @{
            session_id = $SESSION_ID
            event_type = "paste"
            payload    = @{ chars = 120; line = 5 }
            client_ts  = $NOW
            prev_hash  = $null
        }
    )
} $STUDENT_TOKEN
Assert-Ok "Batch accepted"     ($r.ok)
Assert-Ok "Accepted count = 3" ($r.data.accepted -eq 3)

Print-Step "POST /api/events/batch (empty array - expect 400)"
$r = Invoke-API "POST" "/api/events/batch" @{ events = @() } $STUDENT_TOKEN
Assert-Ok "Empty batch -> 400" ($r.status -eq 400)

Print-Step "POST /api/events/batch (no token - expect 401)"
$r = Invoke-API "POST" "/api/events/batch" @{ events = @() }
Assert-Ok "No token -> 401" ($r.status -eq 401)

# =============================================================================
Print-Header "3. EXPLANATION GATE"
# =============================================================================

$GATE_SESSION = [System.Guid]::NewGuid().ToString()
$CODE_SNIPPET = "function binarySearch(arr, target) { let lo = 0, hi = arr.length - 1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (arr[mid] === target) return mid; if (arr[mid] < target) lo = mid + 1; else hi = mid - 1; } return -1; }"

Print-Step "POST /api/gate/challenge"
$r = Invoke-API "POST" "/api/gate/challenge" @{
    session_id   = $GATE_SESSION
    code_snippet = $CODE_SNIPPET
} $STUDENT_TOKEN
Assert-Ok "Challenge created" ($r.ok)
Assert-Ok "gate_id returned"  ($null -ne $r.data.gate_id)
Assert-Ok "question returned" ($null -ne $r.data.question)
$GATE_ID  = $r.data.gate_id
$QUESTION = $r.data.question
Write-Host "  Question: $QUESTION" -ForegroundColor DarkCyan

Print-Step "POST /api/gate/answer (good answer)"
$r = Invoke-API "POST" "/api/gate/answer" @{
    gate_id = $GATE_ID
    answer  = "This is a binary search algorithm. It divides the sorted array in half each iteration by comparing the middle element to the target. If the middle element equals the target it returns the index. If smaller it searches the right half, if larger the left half. Time complexity is O(log n)."
} $STUDENT_TOKEN
Assert-Ok "Answer accepted"   ($r.ok)
Assert-Ok "Score returned"    ($null -ne $r.data.score)
Assert-Ok "Feedback returned" ($null -ne $r.data.feedback)
$scoreDisplay = [math]::Round($r.data.score * 100)
Write-Host "  Score: $scoreDisplay/100 - $($r.data.feedback)" -ForegroundColor DarkCyan
if ($r.data.passed) {
    Write-Host "  PASSED" -ForegroundColor Green
} else {
    Write-Host "  NOT PASSED" -ForegroundColor Red
}

Print-Step "POST /api/gate/answer (duplicate - expect 409)"
$r = Invoke-API "POST" "/api/gate/answer" @{ gate_id = $GATE_ID; answer = "trying again with more text here" } $STUDENT_TOKEN
Assert-Ok "Duplicate answer -> 409" ($r.status -eq 409)

Print-Step "POST /api/gate/challenge (snippet too short - expect 400)"
$r = Invoke-API "POST" "/api/gate/challenge" @{ session_id = $GATE_SESSION; code_snippet = "x=1" } $STUDENT_TOKEN
Assert-Ok "Short snippet -> 400" ($r.status -eq 400)

# =============================================================================
Print-Header "4. AI GATEWAY"
# =============================================================================

Write-Host "  (waiting 3s before hitting Gemini...)" -ForegroundColor DarkGray
Start-Sleep -Seconds 3

Print-Step "POST /api/gateway/chat (simple message)"
$r = Invoke-API "POST" "/api/gateway/chat" @{
    messages = @(
        @{ role = "user"; content = "What is a for loop? Answer in one sentence." }
    )
} $STUDENT_TOKEN
if ($r.status -eq 503) {
    Write-Host "  [SKIP]  Chat -> Gemini 503 (rate limit / high demand - transient)" -ForegroundColor DarkYellow
} else {
    Assert-Ok "Chat response ok"       ($r.ok)
    Assert-Ok "Message content exists" ($null -ne $r.data.message.content)
    Assert-Ok "Usage returned"         ($r.data.usage.total_tokens -gt 0)
    Assert-Ok "AI level returned"      ($null -ne $r.data.ai_level)
    if ($r.data -and $r.data.message -and $r.data.message.content) {
        $preview = $r.data.message.content.Substring(0, [Math]::Min(120, $r.data.message.content.Length))
        Write-Host "  Reply: $preview..." -ForegroundColor DarkCyan
    }
}

Print-Step "GET /api/gateway/quota"
$r = Invoke-API "GET" "/api/gateway/quota" $null $STUDENT_TOKEN
Assert-Ok "Quota returned"  ($r.ok)
Assert-Ok "used >= 0"       ($r.data.used -ge 0)
Assert-Ok "remaining >= 0"  ($r.data.remaining -ge 0)
Write-Host "  Tokens used: $($r.data.used) / $($r.data.limit)" -ForegroundColor DarkCyan

Print-Step "POST /api/gateway/chat (empty messages - expect 400)"
$r = Invoke-API "POST" "/api/gateway/chat" @{ messages = @() } $STUDENT_TOKEN
Assert-Ok "Empty messages -> 400" ($r.status -eq 400)

Print-Step "POST /api/gateway/chat (no token - expect 401)"
$r = Invoke-API "POST" "/api/gateway/chat" @{ messages = @(@{ role = "user"; content = "hi" }) }
Assert-Ok "No token -> 401" ($r.status -eq 401)

# =============================================================================
Print-Header "5. DASHBOARD (instructor only)"
# =============================================================================

Print-Step "GET /api/dashboard/students (student token - expect 403)"
$r = Invoke-API "GET" "/api/dashboard/students" $null $STUDENT_TOKEN
Assert-Ok "Student -> 403 Forbidden" ($r.status -eq 403)

Print-Step "GET /api/dashboard/students (instructor)"
$r = Invoke-API "GET" "/api/dashboard/students" $null $INSTRUCTOR_TOKEN
Assert-Ok "Students list returned" ($r.ok)
Assert-Ok "students array exists"  ($null -ne $r.data.students)
Write-Host "  Students in DB: $($r.data.students.Count)" -ForegroundColor DarkCyan

Print-Step "GET /api/dashboard/students/:id (instructor)"
$r = Invoke-API "GET" "/api/dashboard/students/$STUDENT_ID" $null $INSTRUCTOR_TOKEN
Assert-Ok "Student detail returned" ($r.ok)
Assert-Ok "user block present"      ($null -ne $r.data.user)
Assert-Ok "scores array present"    ($null -ne $r.data.scores)
Assert-Ok "gates array present"     ($null -ne $r.data.gates)
Assert-Ok "ai_usage array present"  ($null -ne $r.data.ai_usage)

Print-Step "GET /api/dashboard/students/00000000-... (unknown - expect 404)"
$r = Invoke-API "GET" "/api/dashboard/students/00000000-0000-0000-0000-000000000000" $null $INSTRUCTOR_TOKEN
Assert-Ok "Unknown student -> 404" ($r.status -eq 404)

Print-Step "GET /api/events/session/:id (instructor)"
$r = Invoke-API "GET" "/api/events/session/$SESSION_ID" $null $INSTRUCTOR_TOKEN
Assert-Ok "Session events returned" ($r.ok)
Assert-Ok "events array present"    ($null -ne $r.data.events)
Write-Host "  Events in session: $($r.data.events.Count)" -ForegroundColor DarkCyan

Print-Step "GET /api/dashboard/sessions/:id/integrity"
$r = Invoke-API "GET" "/api/dashboard/sessions/$SESSION_ID/integrity" $null $INSTRUCTOR_TOKEN
Assert-Ok "Integrity endpoint responds" ($r.ok)
Assert-Ok "valid field present"         ($r.data.PSObject.Properties.Name -contains "valid")
Write-Host "  Chain valid: $($r.data.valid)  Events checked: $($r.data.events)" -ForegroundColor DarkCyan

# =============================================================================
Print-Header "RESULTS"
# =============================================================================
$TOTAL = $PASS + $FAIL
Write-Host ""
Write-Host "  Passed : $PASS / $TOTAL" -ForegroundColor $(if ($FAIL -eq 0) { "Green" } else { "Yellow" })
Write-Host "  Failed : $FAIL / $TOTAL" -ForegroundColor $(if ($FAIL -eq 0) { "Green" } else { "Red" })
Write-Host ""
if ($FAIL -eq 0) {
    Write-Host "  All tests passed!" -ForegroundColor Green
} else {
    Write-Host "  Some tests failed - check output above." -ForegroundColor Red
}
Write-Host ""
