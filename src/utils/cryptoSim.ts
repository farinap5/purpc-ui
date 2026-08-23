/**
 * Simulated AES-256-GCM encryption & decryption utility for PurpleCommand C2 visualization.
 */

export interface EncryptedPacket {
  plaintext: string;
  ciphertext: string;
  iv: string;
  tag: string;
  keyDerivation: string;
  bytes: number;
}

// Generates a random hex string of specified size
export function generateRandomHex(length: number): string {
  const chars = "0123456789abcdef";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Simulates AES-256-GCM encryption
 */
export function simulateEncrypt(text: string, algo: string = "AES-256-GCM"): EncryptedPacket {
  const iv = generateRandomHex(24); // 96-bit IV
  const tag = generateRandomHex(32); // 128-bit Authentication Tag
  
  // Create simulated ciphertext by converting characters to hex and scrambling slightly
  let ciphertext = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // XOR with a simulated key byte to make it look like real cryptography
    const scrambled = (code ^ 0xa5).toString(16).padStart(2, "0");
    ciphertext += scrambled;
  }
  
  // Add some trailing random hex bytes to match typical padding/payload overhead
  const padLength = Math.max(32 - ciphertext.length, 16);
  ciphertext += generateRandomHex(padLength);

  return {
    plaintext: text,
    ciphertext,
    iv,
    tag,
    keyDerivation: `ECDH-secp256r1-KDF-SHA256 (${algo})`,
    bytes: Math.ceil((ciphertext.length + iv.length + tag.length) / 2)
  };
}

/**
 * Simulates decrypting ciphertext
 */
export function simulateDecrypt(ciphertextHex: string, originalPlaintext: string = "Command response successfully decrypted"): string {
  // Return the original text. In a simulated C2, we know what the session intends to say.
  if (ciphertextHex.length > 0) {
    return originalPlaintext;
  }
  return originalPlaintext;
}

/**
 * Generates mock session terminal command outputs based on commands
 */
export function getCommandOutput(command: string, sessionUser: string, sessionComputer: string, pid: number): {
  response: string;
  lootsGenerated?: {
    type: "Credential" | "Image" | "File" | "Token";
    data: string;
    description: string;
  }[];
} {
  const cmdClean = command.trim().toLowerCase();
  const args = command.trim().split(/\s+/).slice(1);
  
  if (cmdClean === "help") {
    return {
      response: `
================================================================================
                    PURPLECOMMAND SESSION HELP CENTER
================================================================================
Command          Description                               Example
-------          -----------                               -------
help             Display this command reference system     help
shell <cmd>      Execute shell command via cmd.exe/bash    shell whoami
sleep <sec>      Modify sleep interval time of session       sleep 5
screenshot       Request real-time screen capture of target screenshot
hashdump         Extract credentials from SAM/LSASS database hashdump
inject <pid>     Inject payload shellcode into active PID  inject 3120
socks <port>     Pivot & establish secure reverse SOCKS4a  socks 1080
download <file>  Asynchronously stage & download host file download C:\\hosts
getuid           Retrieve current process security token   getuid
kerberoast       Perform Kerberoasting attack on DC SPNs   kerberoast
kill             Terminate the current session session      kill
exit             De-register and secure clean exit         exit
================================================================================`
    };
  }
  
  if (cmdClean.startsWith("shell ")) {
    const shellCmd = command.substring(6).trim();
    if (shellCmd === "whoami") {
      return {
        response: `[+] Host query returned system token context:\n${sessionUser === "SYSTEM" ? "nt authority\\system" : `domain_ad\\${sessionUser}`}`
      };
    } else if (shellCmd === "net user" || shellCmd === "net users") {
      return {
        response: `[+] Enumerating local accounts for \\\\${sessionComputer}:\n\n` +
          `User accounts for \\\\${sessionComputer}\n` +
          `-------------------------------------------------------------------------------\n` +
          `Administrator            Guest                    krbtgt                   \n` +
          `csdev                    backup_svc               sql_operator             \n` +
          `The command completed successfully.`
      };
    } else if (shellCmd.includes("ipconfig") || shellCmd.includes("ifconfig")) {
      return {
        response: `[+] Network Interface Card Configuration:\n\n` +
          `Ethernet adapter Ethernet0:\n` +
          `   Connection-specific DNS Suffix  . : localdomain\n` +
          `   IPv4 Address. . . . . . . . . . . : 192.168.1.104\n` +
          `   Subnet Mask . . . . . . . . . . . : 255.255.255.0\n` +
          `   Default Gateway . . . . . . . . . : 192.168.1.1`
      };
    } else if (shellCmd.includes("hostname")) {
      return {
        response: `[+] Hostname request completed:\n${sessionComputer}`
      };
    } else {
      // General response
      return {
        response: `[+] Shell execution dispatched: "${shellCmd}"\n[+] Output:\n` +
          `Active process PID: ${pid + 12}\n` +
          `Directory: C:\\Windows\\system32\\\n\n` +
          `Status: Success\n` +
          `Output buffer (34 bytes):\n` +
          `Microsoft Windows [Version 10.0.22631]\n` +
          `(c) Microsoft Corporation. All rights reserved.`
      };
    }
  }

  if (cmdClean.startsWith("sleep ")) {
    const sec = args[0] || "5";
    return {
      response: `[*] Tasked session to sleep for ${sec}s (jitter: 10%)\n[+] Session confirmed sleep adjustment to ${sec} seconds.`
    };
  }

  if (cmdClean === "screenshot") {
    const randomImgUrls = [
      "https://images.unsplash.com/photo-1542831371-29b0f74f9713?w=800&auto=format&fit=crop&q=60", // code editor
      "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&auto=format&fit=crop&q=60", // code dark
      "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&auto=format&fit=crop&q=60", // cyber code
      "https://images.unsplash.com/photo-1510511459019-5dda7724fd87?w=800&auto=format&fit=crop&q=60"  // matrices
    ];
    const pickedUrl = randomImgUrls[Math.floor(Math.random() * randomImgUrls.length)];
    return {
      response: `[*] Tasking session to snap active display (Session ID: 1)\n` +
        `[+] Screen grab completed (Format: JPEG, Size: 184 KB)\n` +
        `[+] Decrypting pixel blocks... verified GCM integrity.\n` +
        `[+] Image captured and dispatched to the Images tab under ID LT-SCREEN.`,
      lootsGenerated: [{
        type: "Image",
        data: pickedUrl,
        description: `Active screen of ${sessionUser}@${sessionComputer} containing sensitive terminal logs`
      }]
    };
  }

  if (cmdClean === "hashdump") {
    if (sessionUser !== "SYSTEM" && sessionUser !== "Administrator" && sessionUser !== "root") {
      return {
        response: `[-] Access Denied: Extraction of SAM registry hashes requires elevated administrative tokens (e.g. SYSTEM). Run elevate first.`
      };
    }
    const adminHash = generateRandomHex(32);
    const userHash = generateRandomHex(32);
    return {
      response: `[*] Dispatching samdump module into remote LSASS process memory space...\n` +
        `[+] Injector allocated 1204 bytes memory at base 0x7ffd5e0a0000\n` +
        `[+] Dumping local account database hashes (NTLM):\n\n` +
        `Administrator:500:aad3b435b51404eeaad3b435b51404ee:${adminHash}:::\n` +
        `Guest:501:aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0:::\n` +
        `DefaultAccount:503:aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0:::\n` +
        `local_operator:1002:aad3b435b51404eeaad3b435b51404ee:${userHash}:::\n\n` +
        `[+] Hashes parsed successfully. Credentials appended to Loot Database automatically.`,
      lootsGenerated: [
        {
          type: "Credential",
          data: `Administrator:500:aad3b435b51404eeaad3b435b51404ee:${adminHash}:::`,
          description: `Extracted SAM database hash from elevated session process PID ${pid}`
        },
        {
          type: "Credential",
          data: `local_operator:1002:aad3b435b51404eeaad3b435b51404ee:${userHash}:::`,
          description: `Extracted Local User SAM hash from elevated session process PID ${pid}`
        }
      ]
    };
  }

  if (cmdClean.startsWith("inject ")) {
    const targetPid = args[0] || "3210";
    return {
      response: `[*] Deploying payload injection task on target process: ${targetPid}\n` +
        `[*] Opening process handle via VirtualAllocEx...\n` +
        `[+] Process memory allocated with PAGE_EXECUTE_READWRITE permissions.\n` +
        `[*] Writing encrypted payload shellcode (420 bytes)... verified hash.\n" +` +
        `[+] Remote thread injected successfully using NtCreateThreadEx!\n` +
        `[+] Callback received! New interactive Session spawned! check Sessions.`
    };
  }

  if (cmdClean.startsWith("socks ")) {
    const port = args[0] || "1080";
    return {
      response: `[*] Initializing SOCKS4a service on TeamServer listening port ${port}...\n` +
        `[+] Pivot connection established through Session tunnel successfully.\n` +
        `[+] Traffic will be dynamically routed through process PID ${pid}.\n` +
        `[+] Usage: proxychains curl -s http://internal-intranet.local`
    };
  }

  if (cmdClean.startsWith("download ")) {
    const targetFile = command.substring(9).trim() || "C:\\secret.txt";
    return {
      response: `[*] Queuing file transfer for: "${targetFile}"\n` +
        `[*] File size determined: 45.2 KB\n` +
        `[+] Downloading chunk 1/4 (12288 bytes) - AES decrypted block\n` +
        `[+] Downloading chunk 2/4 (12288 bytes) - AES decrypted block\n` +
        `[+] Downloading chunk 3/4 (12288 bytes) - AES decrypted block\n` +
        `[+] Downloading chunk 4/4 (8400 bytes) - AES decrypted block\n` +
        `[+] Download complete. File saved in C2 loot database directory.`,
      lootsGenerated: [{
        type: "File",
        data: `${targetFile} (Downloaded, 45.2 KB)`,
        description: `Successfully pillaged file from ${sessionComputer}`
      }]
    };
  }

  if (cmdClean === "getuid") {
    return {
      response: `[+] Connected token user query completed:\n` +
        `User Domain Authority: ${sessionComputer}\\${sessionUser}\n` +
        `Process Token Integrity Level: ${sessionUser === "SYSTEM" ? "High/System" : "Medium"}`
    };
  }

  if (cmdClean === "kerberoast") {
    return {
      response: `[*] Auditing Domain controller SPNs seeking kerberoastable hashes...\n` +
        `[+] Found 2 Active SPNs registered for SQL Server services:\n\n` +
        `$krb5tgs$23$*sql_service$CONTOSO.LOCAL*$MSSQLSvc/sql-db-01.contoso.local:1433*$${generateRandomHex(128)}\n` +
        `$krb5tgs$23$*mssql_operator$CONTOSO.LOCAL*$MSSQLSvc/sql-dc-02.contoso.local:1433*$${generateRandomHex(128)}\n\n` +
        `[+] Hashes added to Loot database. Copy them into JohnTheRipper or Hashcat (Format 13100) to crack.`
    };
  }

  if (cmdClean === "kill") {
    return {
      response: `[*] Sending kill signal to process PID ${pid}...\n` +
        `[+] Session killed successfully. Connection severed with TeamServer.`
    };
  }

  if (cmdClean === "exit") {
    return {
      response: `[*] Sending graceful exit notification...\n` +
        `[+] Session self-terminated cleanly. No tracks left in logs.`
    };
  }

  // Unknown command
  return {
    response: `[-] Command error: Command "${command}" is unrecognized or requires arguments.\n` +
      `Type "help" to display the Command Reference handbook.`
  };
}
