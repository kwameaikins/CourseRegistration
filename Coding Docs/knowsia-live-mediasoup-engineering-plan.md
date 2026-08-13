# Knowsia Live — Mediasoup Engineering Plan

## Executive Summary

Knowsia Live should be designed as a production-grade, education-focused live learning platform built around **mediasoup** as the core WebRTC Selective Forwarding Unit (SFU).

The goal should **not** be to recreate Zoom feature-for-feature. Instead, Knowsia should build a conferencing experience optimized for professional education, with:

- Exact participant identity
- Reliable attendance tracking
- Screen sharing and tutor-led delivery
- Role-based audio/video permissions
- Recording
- Adaptive media quality
- Support for 500+ participants
- Multiple concurrent classrooms
- Direct integration with courses, batches, assessments, certificates, and analytics

Mediasoup provides the media-routing foundation while Knowsia owns the product layer, signaling, authentication, room orchestration, attendance, recording workflows, analytics, and user experience.

---

## 1. Why Mediasoup

Mediasoup is a low-level WebRTC SFU framework.

It is not a complete Zoom-style application. It provides the media infrastructure that Knowsia can build upon.

The architecture fits Knowsia well because:

- The Node.js/TypeScript API controls mediasoup.
- Native C/C++ worker processes handle media traffic.
- Each worker operates primarily on one CPU core.
- Routers act as media-routing domains.
- Mediasoup forwards RTP instead of decoding and re-encoding every stream.
- It supports WebRTC, simulcast, scalable video coding, active speaker detection, DataChannels, multi-router scaling, and inter-router piping.
- Knowsia can maintain its existing TypeScript/Node.js application stack.
- Mediasoup is permissively licensed and can be used inside a commercial proprietary platform.

The strategic objective is:

> **Knowsia owns the learning platform and meeting experience while mediasoup handles the low-level media-routing layer.**

---

## 2. Core Mediasoup Concepts

| Concept | Purpose |
|---|---|
| Worker | Native media subprocess, generally using one CPU core |
| Router | Media-routing domain / SFU room |
| WebRtcTransport | WebRTC connection between a participant and mediasoup |
| Producer | Audio, video, or screen-sharing track published by a participant |
| Consumer | Media track received by another participant |
| PipeTransport | Connection used to move media between routers |

A tutor publishing microphone, camera, and screen share may create three Producers. A learner receiving those three tracks may have three Consumers.

Capacity planning should therefore focus on:

```text
producers × consumers × bitrate
```

rather than participant count alone.

---

## 3. Large-Classroom Design Philosophy

Knowsia should **not** design a 500-person classroom where every participant publishes audio and video simultaneously.

The typical Knowsia class is better modeled as:

```text
Tutor
+
1–2 co-hosts/panelists
+
Hundreds of learners
```

### Recommended role permissions

**Tutor**

```text
Audio       YES
Camera      YES
Screen      YES
Receive     YES
```

**Co-host**

```text
Audio       YES
Camera      YES
Screen      Optional
Receive     YES
```

**Learner**

```text
Audio       OFF by default
Camera      OFF by default
Screen      NO
Receive     YES
```

When a learner raises a hand:

```text
Viewer
  ↓
Tutor approves
  ↓
Temporary speaker
  ↓
Microphone/camera enabled
  ↓
Question answered
  ↓
Viewer
```

This significantly improves scalability.

---

## 4. Proposed 500-Participant Architecture

A 500-person session should not depend on a single mediasoup router.

```text
                     PRESENTERS
                  Audio/Video/Screen
                         │
                         ▼
                 ┌──────────────┐
                 │ Origin Router│
                 │   Worker 1   │
                 └──────┬───────┘
                        │
                 pipeToRouter()
                        │
         ┌──────────────┼──────────────┐
         │              │              │
         ▼              ▼              ▼
     Router A        Router B       Router C
     Worker 2        Worker 3       Worker 4
         │              │              │
     Learners        Learners        Learners
       1–125          126–250         251–375

                        │
                        ▼
                     Router D
                     Worker 5
                        │
                    Learners
                     376–500
```

The origin router receives presenter media, which is piped to viewer routers. Each viewer router handles a subset of participants.

---

## 5. Initial Sharding Target

For the first production version, target approximately:

```text
100–150 learners per viewer router
```

Example:

```text
500 learners
÷
125 learners/router
≈
4 viewer routers
```

If each learner consumes tutor audio, tutor camera, and tutor screen:

```text
125 × 3 = 375 Consumers
```

per viewer router.

The exact number should be established through load testing.

---

## 6. Multi-Router Scaling with `pipeToRouter()`

Mediasoup supports moving Producers between Routers using `pipeToRouter()`.

Conceptually:

```typescript
await originRouter.pipeToRouter({
  producerId: tutorVideoProducer.id,
  router: viewerRouterB
});
```

The tutor uploads once. Knowsia distributes the same media to additional routers.

This enables scale across:

- Multiple mediasoup workers
- Multiple CPU cores
- Multiple physical servers

---

## 7. Multi-Server Architecture

```text
                 MEDIA SERVER 1
                 Origin Router
                       │
            ┌──────────┴──────────┐
            │                     │
            ▼                     ▼
      MEDIA SERVER 2        MEDIA SERVER 3
       Viewer Router         Viewer Router
            │                     │
        250 users              250 users
```

The Knowsia control plane should coordinate server selection, worker selection, router creation, participant placement, pipe creation, and failure recovery.

---

## 8. Dedicated RTC Service

Mediasoup logic should not be embedded directly into the main Knowsia registration application.

Recommended service structure:

```text
rtc-control/
rtc-signaling/
rtc-media/
rtc-recording/
rtc-turn/
rtc-monitoring/
```

Conceptually:

```text
                     KNOSIA
                        │
                 Session Service
                        │
                        ▼
                RTC CONTROL PLANE
                 TypeScript/Node
                        │
        ┌───────────────┼───────────────┐
        │               │               │
    Signaling      Room Manager    Attendance
        │               │               │
        └───────────────┼───────────────┘
                        │
                 mediasoup hosts
```

---

## 9. Signaling Architecture

Mediasoup does not provide signaling. Knowsia must build it.

Recommended approach:

```text
HTTPS REST
+
WebSocket
```

### REST responsibilities

- Create session
- Read session details
- Validate authorization
- Generate RTC access
- Start/stop recording
- End meeting
- Administrative actions

### WebSocket responsibilities

- Join session
- Participant presence
- New Producer
- Consumer creation
- Mute/unmute
- Raise hand
- Promote learner to speaker
- Remove participant
- Active speaker changes
- Reactions
- Transport state
- Reconnection
- Session termination

---

## 10. Participant Identity

Before a learner joins, Knowsia already knows:

```text
registration_id = 59382
student_id = 10443
batch_id = ESG-AUG26
session_id = SESSION-004
role = learner
```

The learner should receive a short-lived RTC access token containing that identity.

Flow:

```text
Browser
   │
   │ Connect with token
   ▼
Knowsia RTC
   │
   │ Validate registration
   ▼
Session permitted?
   │
 YES
   ▼
Assign media shard
```

This eliminates name-based attendance matching.

---

## 11. Mediasoup Connection Flow

```text
1. Browser requests Router RTP capabilities
2. Browser creates mediasoup Device
3. device.load(routerRtpCapabilities)
4. Server creates WebRtcTransport
5. Browser creates corresponding transport
6. ICE/DTLS negotiation occurs
7. Browser publishes tracks
8. Server creates Producers
9. Eligible participants are notified
10. Server creates Consumers
11. Browser receives media
```

---

## 12. Send and Receive Transports

Participants who can publish should typically have:

```text
Send Transport
    │
    ├── microphone Producer
    └── camera Producer

Receive Transport
    │
    ├── tutor audio Consumer
    ├── tutor video Consumer
    └── screen Consumer
```

Most large-class learners can initially be receive-only.

---

## 13. Simulcast and Adaptive Quality

Simulcast should be part of the first serious production version.

```text
LOW      ~180p
MEDIUM   ~360p
HIGH     ~720p
```

Knowsia should adapt the delivered layer according to network conditions:

```text
Excellent network → 720p
Moderate network  → 360p
Weak network      → 180p
Very weak network → audio only
```

---

## 14. Media Priority

Recommended degradation order:

```text
Network deteriorates
       ↓
Reduce tutor video quality
       ↓
Reduce frame rate
       ↓
180p video
       ↓
Disable secondary cameras
       ↓
Audio + shared content
       ↓
Reconnect only if necessary
```

Priority:

```text
Audio
>
Shared teaching content
>
Tutor camera
>
Other participant cameras
```

---

## 15. Active Speaker Management

Mediasoup supports active-speaker and audio-level observation.

Knowsia can use this to keep the main classroom view focused on the tutor or currently approved speaker.

---

## 16. User Interface Direction

Knowsia Live should be education-first rather than a direct Zoom clone.

```text
┌─────────────────────────────────────────────┐
│ Knowsia Live          487 participants      │
├─────────────────────────────┬───────────────┤
│                             │ Chat          │
│                             │ Questions     │
│       MAIN CONTENT          │ Polls         │
│                             │ Participants  │
│     Tutor / Screen          │               │
│                             │               │
├─────────────────────────────┴───────────────┤
│ Mic  Camera  Share  Raise Hand  Leave      │
└─────────────────────────────────────────────┘
```

Teaching content should dominate the learner interface.

---

## 17. Chat and Collaboration

Persistent chat should use Knowsia's application infrastructure:

```text
WebSocket
    ↓
Knowsia Chat Service
    ↓
PostgreSQL / Redis
```

This gives Knowsia chat history, moderation, analytics, replay, auditability, and persistence.

DataChannels can still support ephemeral collaboration such as cursor movements and temporary reactions.

---

## 18. Attendance Architecture

Recommended append-only attendance table:

```text
rtc_attendance_events
─────────────────────────
id
session_id
registration_id
peer_id
event_type
server_timestamp
connection_id
media_router
metadata
```

Example:

```text
17:58:52 JOIN_REQUESTED
17:58:53 SIGNALING_CONNECTED
17:58:54 MEDIA_CONNECTED
18:32:17 MEDIA_DISCONNECTED
18:32:20 MEDIA_RECONNECTED
21:01:11 SESSION_LEFT
```

This provides trusted server-side attendance timestamps.

---

## 19. Attendance Validation

Do not count merely opening the class page as attendance.

Use a combination of:

```text
Authenticated signaling session
+
WebRTC media connection
+
Periodic heartbeat
```

Certificate eligibility can then be based on reliable attendance data.

---

## 20. Recording Architecture

```text
                     Router
                       │
                 PlainTransport
                       │
                       ▼
                Recording Worker
                 FFmpeg/GStreamer
                       │
                       ▼
                    MP4/WebM
                       │
                       ▼
                Cloudflare R2
```

Recording should run outside the live media worker pool.

---

## 21. Recording Modes

### Archive recording

```text
tutor_audio.opus
tutor_camera.webm
screen.webm
```

### Programme recording

A composed student-facing recording such as:

```text
session.mp4
```

This can later feed Knowsia's LMS automatically.

---

## 22. TURN Infrastructure

Pair mediasoup with **coturn**.

```text
Normal path

Student
   │
   └──────────────────► mediasoup


Restricted network

Student
   │
   ▼
 coturn
   │
   ▼
mediasoup
```

Track:

```text
% direct UDP
% direct TCP
% TURN UDP
% TURN TCP/TLS
```

TURN should be treated as production-critical.

---

## 23. Initial Media-Server Topology

Avoid excessive complexity initially.

```text
                    Load Balancer
                         │
                 Signaling/API Nodes
                         │
                        Redis
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
     Media Node A   Media Node B   Media Node C
      mediasoup      mediasoup      mediasoup
       workers        workers        workers
```

Workers can be mapped approximately to CPU cores:

```text
CPU 0 → Worker 0
CPU 1 → Worker 1
CPU 2 → Worker 2
CPU 3 → Worker 3
```

---

## 24. WebRTC Port Management

A practical configuration may expose a predictable port per worker:

```text
Worker 1 → UDP/TCP 40001
Worker 2 → UDP/TCP 40002
Worker 3 → UDP/TCP 40003
Worker 4 → UDP/TCP 40004
```

This simplifies firewall and infrastructure management.

---

## 25. Public Address Configuration

Correct public-address advertisement is essential.

Example:

```text
Private IP:
10.0.0.24

Public IP:
196.x.x.x
```

Incorrect ICE configuration may work in local testing and fail for real learners.

---

## 26. Monitoring and Observability

Track at minimum:

- Worker CPU usage
- Network throughput
- Participant RTT
- Packet loss
- Jitter
- Bitrate
- Reconnection rate
- TURN usage
- Consumer count
- Producer count
- Active sessions
- Recording status
- Join success rate

Example dashboard:

```text
KNOWSIA LIVE — SESSION HEALTH

Participants                   487
Media connected                481
Reconnecting                     3
TURN users                      38

Average RTT                  91 ms
Packet loss                  1.7%
Average video              824 kbps

Router A consumers             372
Router B consumers             369
Router C consumers             381
Router D consumers             366

Media node CPU                  48%
Peak worker CPU                 69%

Recording                    HEALTHY
```

---

## 27. Failure Handling

```text
Worker failure
      ↓
Room controller detects failure
      ↓
Replacement router allocated
      ↓
Browsers notified
      ↓
Media transports recreated
      ↓
Participants reconnect
      ↓
Session resumes
```

The objective should be fast recovery.

---

## 28. RTC Scheduler

Knowsia should eventually build a room-placement scheduler.

Example:

```text
Node A
workers available: 5
load: 42%

Node B
workers available: 3
load: 67%

Node C
workers available: 6
load: 31%
```

A 500-person session might be allocated as:

```text
Origin router       → Node C Worker 1
Viewer shard 1      → Node C Worker 2
Viewer shard 2      → Node C Worker 3
Viewer shard 3      → Node A Worker 1
Viewer shard 4      → Node A Worker 2
```

---

## 29. State Management

Do not serialize mediasoup runtime objects such as Workers, Routers, Transports, Producers, or Consumers into PostgreSQL or Redis.

### Redis

Use for:

- Node discovery
- Room ownership
- Presence
- Locks
- Pub/Sub
- Signaling coordination
- Temporary session state

### PostgreSQL

Use for:

- Sessions
- Registrations
- Attendance
- Recordings
- Auditable meeting history
- Certificates
- Course/session relationships

---

## 30. Proposed Database Model

### `live_sessions`

```text
id
batch_id
course_session_id
mode
scheduled_start
scheduled_end
expected_capacity
status
recording_policy
```

### `rtc_rooms`

```text
id
live_session_id
role
node_id
router_id
capacity_target
status
```

### `rtc_participants`

```text
id
live_session_id
registration_id
peer_id
role
joined_at
left_at
```

### `rtc_attendance_events`

```text
id
live_session_id
registration_id
event
occurred_at
metadata
```

### `rtc_recordings`

```text
id
live_session_id
storage_key
started_at
ended_at
status
```

---

## 31. Concurrency Model

With Knowsia Live, concurrent rooms are constrained primarily by:

```text
Available CPU
+
Available network capacity
+
Available media workers
+
Room topology
+
Recording resources
```

rather than host licensing.

---

## 32. Recommended Room Modes

| Mode | Typical Size | Media Strategy |
|---|---:|---|
| Tutorial | 2–20 | Fully interactive |
| Classroom | 20–100 | Interactive with limited gallery |
| Large Classroom | 100–500 | Presenter-first; learners promoted |
| Webinar | 500+ | Few publishers; sharded viewers |

---

## 33. Example 500-Person Large Classroom

```text
Expected participants:
500

Active publishers:
Tutor audio
Tutor camera
Tutor screen
2 panelists
Maximum 5 temporary student speakers

Viewer shards:
4–6 mediasoup routers

Default learner:
Receive-only

Camera policy:
Off unless promoted

Quality:
Adaptive simulcast

Recording:
Separate worker pool

Chat:
Knowsia WebSocket service

Attendance:
Knowsia RTC event engine
```

---

## 34. Mediasoup Dependency Strategy

Treat mediasoup itself as an upstream dependency:

```text
Knowsia application
        ↓
mediasoup public API
        ↓
mediasoup worker
```

Do not fork or modify the native mediasoup worker during V1 unless a genuine limitation is discovered.

---

## 35. Development Gates

| Gate | Requirement |
|---|---|
| RTC-0 | 2 browsers with working audio/video |
| RTC-1 | Knowsia authentication and exact identity |
| RTC-2 | 20-person classroom |
| RTC-3 | Screen sharing, mute, host controls, reconnect |
| RTC-4 | Simulcast and adaptive subscriptions |
| RTC-5 | Attendance event engine |
| RTC-6 | TURN and mobile-network testing |
| RTC-7 | Recording to Cloudflare R2 |
| RTC-8 | 100-person controlled load test |
| RTC-9 | Multi-router `pipeToRouter()` |
| RTC-10 | 500-user synthetic load test |
| RTC-11 | Real-world 500-user pilot |
| RTC-12 | Concurrent classes |
| RTC-13 | Multi-node failure/reconnection |
| RTC-14 | Production-cutover eligibility |

Zoom should remain available as fallback throughout development and pilot phases.

---

## 36. Production Acceptance Metrics

Suggested targets:

```text
Join success rate:
> 99.5%

Attendance identity accuracy:
100%

Reconnect success:
> 99%

Recording success:
> 99.9%

Normal peak SFU CPU:
< 70%

Normal bandwidth utilization:
< 70% of interface capacity
```

Also continuously monitor packet loss, RTT, jitter, TURN ratio, and audio continuity.

---

## 37. Features to Exclude from V1

Do not prioritize:

- Virtual backgrounds
- AI avatars
- 500-camera gallery mode
- End-to-end encrypted meeting mode
- Breakout rooms
- Remote desktop control
- PSTN dial-in
- SIP integration
- Simultaneous interpretation
- Advanced collaborative whiteboarding
- Live transcription
- AI meeting summaries
- AI noise cancellation
- 4K video
- Custom mediasoup C++ changes

---

## 38. V1 Product Objective

> **A tutor can reliably teach 500 authenticated learners for three hours, share a screen, take questions, record the class, and produce exact attendance.**

If Knowsia Live consistently achieves this, it is already a commercially valuable product.

---

## 39. Recommended V1 Architecture

```text
                       ┌──────────────────────┐
                       │     Knowsia LMS      │
                       │ Courses / Batches    │
                       │ Registrations        │
                       └──────────┬───────────┘
                                  │
                                  ▼
                     ┌────────────────────────┐
                     │   RTC Control API      │
                     │ Node.js / TypeScript   │
                     └────────────┬───────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
              ▼                   ▼                   ▼
        Signaling WS          PostgreSQL            Redis
              │            Durable records      Orchestration
              │
              ▼
       ┌────────────────┐
       │ Room Scheduler │
       └───────┬────────┘
               │
        ┌──────┼─────────────────────────────┐
        │      │                             │
        ▼      ▼                             ▼
   Media A   Media B                     Media C
  mediasoup mediasoup                   mediasoup
   workers   workers                     workers
        │      │                             │
        └──────┴──────── pipeToRouter ───────┘
                         │
                         ▼
                   WebRTC learners
                         │
                ┌────────┴────────┐
                ▼                 ▼
             Direct            coturn
                              fallback


                 Separate Recording Pool
                         │
                FFmpeg/GStreamer
                         │
                         ▼
                   Cloudflare R2
```

---

## 40. Final Recommendation

Knowsia should consider mediasoup the **primary technical candidate for Knowsia Live** if the objective is to build a proprietary, scalable, education-focused conferencing platform.

| Strategy | Control | Complexity | Recommended Use |
|---|---:|---:|---|
| Zoom | Low | Very Low | Keep as fallback |
| Jitsi | Medium | Low/Medium | Faster deployment |
| LiveKit | High | Medium | Excellent general platform |
| **Mediasoup** | **Very High** | **High** | **Best strategic fit for deep ownership** |
| Build SFU from zero | Maximum | Extreme | Not recommended |

Recommended progression:

```text
20 users
   ↓
100 users
   ↓
Multi-router
   ↓
500 synthetic users
   ↓
500 real participants
   ↓
Concurrent classes
   ↓
Multi-node production
```

The key strategic principle is:

> **Do not build the RTP engine from scratch. Build Knowsia's orchestration, identity, learning, attendance, analytics, recording, and classroom experience around mediasoup.**

That gives Knowsia meaningful technology ownership without unnecessarily recreating one of the hardest parts of modern real-time communications.
