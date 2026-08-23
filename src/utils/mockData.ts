import { Session, Listener, Loot, Script, ConsoleLog, Packet } from "../types";

export const initialSessions: Session[] = [
  {
    id: "S-2616",
    extIp: "192.168.1.104",
    intIp: "192.168.1.104",
    listener: "HTTPS_Secure",
    user: "csdev",
    computer: "DEVWIN-11",
    note: "Primary developer workstation",
    process: "explorer.exe",
    pid: 2616,
    arch: "x64",
    lastActive: 3,
    sleep: "5 seconds",
    os: "Windows",
    status: "active"
  },
  {
    id: "S-2296",
    extIp: "192.168.1.104",
    intIp: "192.168.1.104",
    listener: "HTTP_Session",
    user: "csdev",
    computer: "DEVWIN-11",
    note: "Rundll32 fallback session",
    process: "rundll32.exe",
    pid: 2296,
    arch: "x86",
    lastActive: 4,
    sleep: "1 minute",
    os: "Windows",
    status: "active"
  },
  {
    id: "S-3280",
    extIp: "192.168.1.103",
    intIp: "192.168.1.150",
    listener: "HTTPS_Secure",
    user: "Administrator",
    computer: "WIN-DC01",
    note: "Domain Controller - Highly Critical!",
    process: "spoolsv.exe",
    pid: 3280,
    arch: "x64",
    lastActive: 12,
    sleep: "5 seconds",
    os: "Windows",
    status: "active"
  },
  {
    id: "S-4052",
    extIp: "192.168.1.109",
    intIp: "10.10.10.22",
    listener: "HTTPS_Secure",
    user: "root",
    computer: "ubuntu-web-prod",
    note: "Linux Web Facing Server",
    process: "apache2",
    pid: 4052,
    arch: "x64",
    lastActive: 56,
    sleep: "10 seconds",
    os: "Linux",
    status: "active"
  },
  {
    id: "S-5012",
    extIp: "192.168.1.115",
    intIp: "192.168.1.115",
    listener: "DNS_Tunnel",
    user: "jdoe",
    computer: "JDOE-MACBOOK",
    note: "Marketing Lead Device",
    process: "launchd",
    pid: 5012,
    arch: "ARM64",
    lastActive: 140,
    sleep: "5 minutes",
    os: "macOS",
    status: "active"
  },
  {
    id: "S-9102",
    extIp: "184.22.103.54",
    intIp: "172.16.5.90",
    listener: "HTTPS_Secure",
    user: "SYSTEM",
    computer: "WIN-SQL-CLUSTER",
    note: "SQL Database Server - Elevated Token",
    process: "sqlservr.exe",
    pid: 9102,
    arch: "x64",
    lastActive: 7,
    sleep: "3 seconds",
    os: "Windows",
    status: "active"
  }
];

export const initialListeners: Listener[] = [
  {
    id: "L-1",
    name: "HTTPS_Secure",
    payloadType: "Session HTTPS",
    host: "192.168.1.103",
    port: 443,
    status: "Active",
    encryption: "AES-256-GCM"
  },
  {
    id: "L-2",
    name: "HTTP_Session",
    payloadType: "Session HTTP",
    host: "192.168.1.103",
    port: 80,
    status: "Active",
    encryption: "AES-256-GCM"
  },
  {
    id: "L-3",
    name: "DNS_Tunnel",
    payloadType: "Session DNS",
    host: "ns1.purplecommand.org",
    port: 53,
    status: "Active",
    encryption: "RC4"
  }
];

export const initialLoots: Loot[] = [
  {
    id: "LT-1",
    type: "Credential",
    sourceSession: "S-3280",
    capturedAt: "08/16 15:20:11",
    data: "Administrator:500:aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0:::",
    description: "NTLM Hash extracted from LSASS on WIN-DC01"
  },
  {
    id: "LT-2",
    type: "Credential",
    sourceSession: "S-2616",
    capturedAt: "08/16 16:10:44",
    data: "csdev:password123!",
    description: "LSA plaintext credential captured via mimikatz"
  },
  {
    id: "LT-3",
    type: "Image",
    sourceSession: "S-2616",
    capturedAt: "08/16 17:02:15",
    data: "https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=800&auto=format&fit=crop&q=60",
    description: "Active VSCode terminal showing source code repository on DevWin"
  },
  {
    id: "LT-4",
    type: "File",
    sourceSession: "S-4052",
    capturedAt: "08/16 17:40:01",
    data: "/var/www/html/config.php (Downloaded, 1.4KB)",
    description: "Database configurations, contains production MySQL credentials"
  }
];

export const initialScripts: Script[] = [
  {
    id: "S-1",
    name: "auto_credential_audit.lua",
    description: "Automatically runs a credential audit when an administrative session checks in.",
    loadedAt: "08/16 10:00:00",
    status: "Active",
    content: `-- PurpleCommand Lua Script
-- auto_credential_audit.lua
purple.on("session_initial", function(session)
    local is_admin = session.user == "SYSTEM" or session.user == "Administrator"

    if is_admin then
        purple.log("Administrative session checked in: " .. session.id)
        purple.task(session.id, "credential_audit")
    end
end)`
  },
  {
    id: "S-2",
    name: "scheduled_task_persistence.lua",
    description: "Deploys a silent daily scheduled task persistence wrapper.",
    loadedAt: "08/16 11:24:12",
    status: "Active",
    content: `-- PurpleCommand Lua Script
-- scheduled_task_persistence.lua
purple.command("persist_schtasks", function(context, args)
    local listener = args[1]
    if listener == nil then
        return context:error("Usage: persist_schtasks [listener_name]")
    end

    context:task("Preparing scheduled task for listener: " .. listener)
    local artifact = purple.artifact(listener, "exe", "x64")
    context:upload("C:\\Windows\\Temp\\updater.exe", artifact)
end)`
  },
  {
    id: "S-3",
    name: "host_info_harvester.lua",
    description: "Gathers system architecture, loaded drivers, antiviruses and domain details automatically.",
    loadedAt: "08/16 13:45:00",
    status: "Disabled",
    content: `-- PurpleCommand Lua Script
-- host_info_harvester.lua
purple.command("harvest_info", function(context)
    context:task("Gathering host architecture and security posture...")
    context:shell("systeminfo")
    context:shell("tasklist /v")
end)`
  }
];

export const initialEventLogs: ConsoleLog[] = [
  {
    id: "evt-1",
    timestamp: "08/16 17:38:49",
    type: "system",
    message: "*** gnome has joined."
  },
  {
    id: "evt-2",
    timestamp: "08/16 17:40:20",
    type: "system",
    message: "*** initial session from csdev@192.168.1.104 (DEVWIN-11)"
  },
  {
    id: "evt-3",
    timestamp: "08/16 17:40:54",
    type: "system",
    message: "*** gnome has left."
  },
  {
    id: "evt-4",
    timestamp: "08/16 17:40:59",
    type: "system",
    message: "*** gnome has joined."
  },
  {
    id: "evt-5",
    timestamp: "08/16 17:43:35",
    type: "input",
    message: "<gnome> steal_token"
  },
  {
    id: "evt-6",
    timestamp: "08/16 17:45:20",
    type: "system",
    message: "*** initial session from Administrator@192.168.1.103 (WIN-DC01)"
  },
  {
    id: "evt-7",
    timestamp: "08/16 18:01:02",
    type: "system",
    message: "*** gnome has left."
  },
  {
    id: "evt-8",
    timestamp: "08/16 18:01:09",
    type: "system",
    message: "*** gnome has joined."
  }
];

export const initialPackets: Packet[] = [
  {
    id: "pkt-1",
    timestamp: "18:01:09",
    direction: "INBOUND",
    type: "WebSocket",
    size: 256,
    encryption: "AES-256-GCM",
    payload: "7e5fb2a912e7654ba8a9117cf431aee8909165b4c12efda"
  },
  {
    id: "pkt-2",
    timestamp: "18:01:10",
    direction: "OUTBOUND",
    type: "WebSocket",
    size: 64,
    encryption: "AES-256-GCM",
    payload: "a2f4c6e80b2a"
  }
];
