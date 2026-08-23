import React, { useState } from "react";
import { ConsoleTabType } from "../types";
import { 
  Radio, 
  Key, 
  FileCode, 
  Download, 
  Camera, 
  Server, 
  MessageSquare, 
  Activity, 
  Settings, 
  UsersRound,
  Zap, 
  TerminalSquare
} from "lucide-react";

interface ToolbarProps {
  onAddTab: (type: ConsoleTabType, title: string, id?: string) => void;
  isWsConnected: boolean;
  onConnectWs: () => void;
  onDisconnectWs: () => void;
  sessionsCount: number;
  activeListenersCount: number;
  currentLag: number;
  onTriggerPayloadModal: () => void;
  onTriggerProfileModal: () => void;
  onTriggerSettingsModal: () => void;
}

interface MenuItem {
  label: string;
  action: () => void;
  disabled?: boolean;
}

export const C2Toolbar: React.FC<ToolbarProps> = ({
  onAddTab,
  isWsConnected,
  onConnectWs,
  onDisconnectWs,
  sessionsCount,
  activeListenersCount,
  currentLag,
  onTriggerPayloadModal,
  onTriggerProfileModal,
  onTriggerSettingsModal
}) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const menus: Record<string, MenuItem[]> = {
    "PurpleCommand": [
      { label: "Connect to TeamServer", action: onConnectWs, disabled: isWsConnected },
      { label: "Disconnect from TeamServer", action: onDisconnectWs, disabled: !isWsConnected },
      { label: "Export Session Log", action: () => alert("Exporting logs...") },
      { label: "Exit C2 Interface", action: () => window.close() }
    ],
    "View": [
      { label: "Active Sessions (Grid)", action: () => onAddTab("sessions", "Active Sessions") },
      { label: "Event Log", action: () => onAddTab("event_log", "Event Log") },
      { label: "Secrets", action: () => onAddTab("loots", "Secrets") },
      { label: "Downloaded Files", action: () => onAddTab("downloads", "Loot: Files") },
      { label: "Images", action: () => onAddTab("images", "Loot: Images") },
      { label: "Event Monitor", action: () => onAddTab("packets", "Event Monitor") }
    ],
    "Payload": [
      { label: "Profiles", action: onTriggerProfileModal }
    ],
    "Administration": [
      { label: "Manage Users", action: () => onAddTab("users", "User Management") }
    ],
    "Attacks": [
      { label: "Spear Phish Emailer", action: () => alert("Opened Spear Phish Module.") },
      { label: "Web Drive-By (Clone Site)", action: () => alert("Configure Site Cloner on HTTP Listener.") },
      { label: "Golden Ticket Creator", action: () => alert("Generating Kerberos TGT ticket...") },
      { label: "Mimikatz Pass-the-Hash", action: () => alert("Choose active administrator session to dispatch.") }
    ],
    "Site Management": [
      { label: "Manage Web Servers", action: () => alert("HTTP/S web management portal.") },
      { label: "Hosted Files", action: () => alert("Upload files to payload server.") }
    ],
    "Reporting": [
      { label: "Activity Report (PDF)", action: () => alert("Compiling Activity Audit trail...") },
      { label: "Hosts / Targets List", action: () => alert("Compiling discovered hosts report...") }
    ],
    "Help": [
      { label: "About PurpleCommand", action: () => alert("PurpleCommand C2 Dashboard") }
    ]
  };

  const handleMenuClick = (menu: string) => {
    if (activeMenu === menu) {
      setActiveMenu(null);
    } else {
      setActiveMenu(menu);
    }
  };

  return (
    <div className="bg-[#2B2C2E] border-b border-[#1C1D1F] select-none text-[#C5C7CA] text-xs font-sans">
      {/* 1. Top File Menu Bar */}
      <div className="flex items-center justify-between px-2 py-0.5 bg-[#212224] border-b border-[#1A1B1C] text-[#B0B3B8]">
        <div className="flex items-center space-x-1 font-sans">
          {Object.keys(menus).map((menuName) => (
            <div key={menuName} className="relative">
              <button
                onClick={() => handleMenuClick(menuName)}
                className={`px-2 py-0.5 rounded cursor-pointer transition-colors text-xs text-gray-300 hover:bg-[#383A3D] hover:text-white ${
                  activeMenu === menuName ? "bg-[#383A3D] text-white" : ""
                }`}
              >
                {menuName}
              </button>
              {activeMenu === menuName && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setActiveMenu(null)}
                  />
                  <div className="absolute left-0 mt-0.5 w-52 bg-[#252628] border border-[#3E4044] rounded shadow-xl z-50 py-1 text-[#E0E0E0]">
                    {menus[menuName].map((item, idx) => (
                      <button
                        key={idx}
                        disabled={item.disabled}
                        onClick={() => {
                          setActiveMenu(null);
                          item.action();
                        }}
                        className={`w-full text-left px-3 py-1 transition-colors text-xs ${
                          item.disabled
                            ? "bg-[#202124] text-gray-600 cursor-not-allowed"
                            : "hover:bg-[#3D4044] hover:text-white cursor-pointer"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
        
        {/* Status indicator - Muted gray palette */}
        <div className="flex items-center space-x-3 text-[11px] font-mono text-gray-400">
          <div className="flex items-center space-x-1.5">
            <span className={`w-2 h-2 rounded-full ${isWsConnected ? "bg-gray-300" : "bg-gray-600"}`}></span>
            <span>{isWsConnected ? "WS: CONNECTED" : "WS: DISCONNECTED"}</span>
          </div>
          <span>|</span>
          <span>Sessions: <span className="text-gray-200 font-bold">{sessionsCount}</span></span>
          <span>|</span>
          <span>Listeners: <span className="text-gray-200 font-bold">{activeListenersCount}</span></span>
          <span>|</span>
          <span>{currentLag}ms lag</span>
        </div>
      </div>

      {/* 2. Visual Toolbar - All icons are exact same gray color (text-gray-400) or text button */}
      <div className="flex items-center justify-between px-2 py-1 bg-[#333437] border-b border-[#212224]">
        <div className="flex items-center space-x-1">
          {/* WS Connect Button - gray icon */}
          <button
            onClick={isWsConnected ? onDisconnectWs : onConnectWs}
            title={isWsConnected ? "Disconnect from TeamServer" : "Connect to TeamServer"}
            aria-label={isWsConnected ? "Disconnect from TeamServer" : "Connect to TeamServer"}
            className={`p-1 rounded transition cursor-pointer border hover:text-white hover:bg-[#424448] ${
              isWsConnected
                ? "text-gray-300 border-[#424448] bg-[#333437]"
                : "text-gray-600 border-[#303236] bg-[#202124] opacity-60 grayscale"
            }`}
          >
            <Zap className="w-4 h-4 text-gray-400" />
          </button>
          
          <div className="h-4 w-[1px] bg-[#222325] mx-1"></div>

          {/* All tab buttons with standard gray icons (text-gray-400) */}
          <button
            onClick={() => onAddTab("listeners", "C2 Listeners")}
            title="Configure C2 Listeners"
            aria-label="Configure C2 Listeners"
            className="p-1 text-gray-300 hover:text-white hover:bg-[#424448] rounded border border-[#3E4044] transition cursor-pointer"
          >
            <Radio className="w-3.5 h-3.5 text-gray-400" />
          </button>

          <button
            onClick={() => onAddTab("sessions", "Active Sessions")}
            title="View Active Sessions"
            aria-label="View Active Sessions"
            className="p-1 text-gray-300 hover:text-white hover:bg-[#424448] rounded border border-[#3E4044] transition cursor-pointer"
          >
            <TerminalSquare className="w-3.5 h-3.5 text-gray-400" />
          </button>

          <button
            onClick={() => onAddTab("loots", "Secrets")}
            title="Secrets"
            aria-label="Secrets"
            className="p-1 text-gray-300 hover:text-white hover:bg-[#424448] rounded border border-[#3E4044] transition cursor-pointer"
          >
            <Key className="w-3.5 h-3.5 text-gray-400" />
          </button>

          <button
            onClick={() => onAddTab("downloads", "Looted Files")}
            title="Loot: Downloaded Target Files"
            aria-label="Downloaded Target Files"
            className="p-1 text-gray-300 hover:text-white hover:bg-[#424448] rounded border border-[#3E4044] transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-gray-400" />
          </button>

          <button
            onClick={() => onAddTab("images", "Device Images")}
            title="Images collected from devices"
            aria-label="Device Images"
            className="p-1 text-gray-300 hover:text-white hover:bg-[#424448] rounded border border-[#3E4044] transition cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5 text-gray-400" />
          </button>

          <button
            onClick={() => onAddTab("scripts", "Lua Script Manager")}
            title="Manage Lua Scripts"
            aria-label="Manage Lua Scripts"
            className="p-1 text-gray-300 hover:text-white hover:bg-[#424448] rounded border border-[#3E4044] transition cursor-pointer"
          >
            <FileCode className="w-3.5 h-3.5 text-gray-400" />
          </button>

          <button
            onClick={() => onAddTab("users", "User Management")}
            title="Manage TeamServer Users"
            aria-label="Manage TeamServer Users"
            className="p-1 text-gray-300 hover:text-white hover:bg-[#424448] rounded border border-[#3E4044] transition cursor-pointer"
          >
            <UsersRound className="w-3.5 h-3.5 text-gray-400" />
          </button>

          <button
            onClick={() => onAddTab("event_log", "Team Server Event Log")}
            title="Chat and system event log"
            aria-label="Chat and System Event Log"
            className="p-1 text-gray-300 hover:text-white hover:bg-[#424448] rounded border border-[#3E4044] transition cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
          </button>

          <button
            onClick={() => onAddTab("packets", "Event Monitor")}
            title="Event Monitor"
            aria-label="Event Monitor"
            className="p-1 text-gray-300 hover:text-white hover:bg-[#424448] rounded border border-[#3E4044] transition cursor-pointer"
          >
            <Activity className="w-3.5 h-3.5 text-gray-400" />
          </button>

          <div className="h-4 w-[1px] bg-[#222325] mx-1"></div>

          {/* Quick Payload Gen */}
          <button
            onClick={onTriggerPayloadModal}
            title="Generate Encrypted C2 Agent Executable"
            aria-label="Generate Encrypted C2 Agent Executable"
            className="p-1 text-gray-300 hover:text-white hover:bg-[#424448] rounded border border-[#3E4044] transition cursor-pointer bg-[#2b2c2e]"
          >
            <Server className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>

        {/* Right quick settings */}
        <div className="flex items-center space-x-2">
          <button
            onClick={onTriggerSettingsModal}
            className="p-1 text-gray-400 hover:text-white hover:bg-[#424448] rounded border border-[#3E4044] transition cursor-pointer"
            title="PurpleCommand Configuration Panel"
            aria-label="PurpleCommand Configuration Panel"
          >
            <Settings className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
      </div>
    </div>
  );
};
