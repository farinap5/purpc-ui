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
import { CompactIconButton, Toolbar } from "./desktop";

interface ToolbarProps {
  onAddTab: (type: ConsoleTabType, title: string, id?: string) => void;
  isWsConnected: boolean;
  onConnectWs: () => void;
  onDisconnectWs: () => void;
  sessionsCount: number;
  activeListenersCount: number;
  currentLag: number;
  onTriggerPayloadModal: () => void;
  onTriggerBuildManager: () => void;
  onTriggerProfileModal: () => void;
  onTriggerListenerModal: () => void;
  onTriggerSettingsModal: () => void;
  onTriggerAboutModal: () => void;
}

interface MenuItem {
  label: string;
  action: () => void;
  disabled?: boolean;
}

interface WailsRuntimeWindow extends Window {
  runtime?: {
    Quit: () => void;
  };
}

const exitC2Interface = () => {
  const runtime = (window as WailsRuntimeWindow).runtime;
  if (runtime?.Quit) {
    runtime.Quit();
    return;
  }
  window.close();
};

export const C2Toolbar: React.FC<ToolbarProps> = ({
  onAddTab,
  isWsConnected,
  onConnectWs,
  onDisconnectWs,
  sessionsCount,
  activeListenersCount,
  currentLag,
  onTriggerPayloadModal,
  onTriggerBuildManager,
  onTriggerProfileModal,
  onTriggerListenerModal,
  onTriggerSettingsModal,
  onTriggerAboutModal
}) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const menus: Record<string, MenuItem[]> = {
    "PurpleCommand": [
      { label: "Connect to TeamServer", action: onConnectWs, disabled: isWsConnected },
      { label: "Disconnect from TeamServer", action: onDisconnectWs, disabled: !isWsConnected },
      { label: "Export Session Log", action: () => alert("Exporting logs...") },
      { label: "Exit C2 Interface", action: exitC2Interface }
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
      { label: "Payload Builder", action: onTriggerPayloadModal },
      { label: "Payload Builds", action: onTriggerBuildManager },
      { label: "Payload Profiles", action: onTriggerProfileModal }
    ],
    "Administration": [
      { label: "Manage Users", action: () => onAddTab("users", "User Management") }
    ],
    "Server": [
      { label: "Listener", action: onTriggerListenerModal, disabled: !isWsConnected },
      { label: "Manage Web Servers", action: () => alert("HTTP/S web management portal.") },
      { label: "Hosted Files", action: () => alert("Upload files to payload server.") }
    ],
    "Reporting": [],
    "Help": [
      { label: "About PurpleCommand", action: onTriggerAboutModal }
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
    <header className="application-chrome">
      <div className="menu-bar">
        <nav className="menu-bar-items" aria-label="Application menu">
          {Object.keys(menus).map((menuName) => (
            <div key={menuName} className="menu-root">
              <button
                onClick={() => handleMenuClick(menuName)}
                className={`menu-bar-button ${activeMenu === menuName ? "is-active" : ""}`}
                aria-haspopup="menu"
                aria-expanded={activeMenu === menuName}
              >
                {menuName}
              </button>
              {activeMenu === menuName && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setActiveMenu(null)}
                  />
                  <div className="desktop-menu" role="menu">
                    {menus[menuName].map((item, idx) => (
                      <button
                        key={idx}
                        disabled={item.disabled}
                        onClick={() => {
                          setActiveMenu(null);
                          item.action();
                        }}
                        className="desktop-menu-item"
                        role="menuitem"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </nav>
        
        <div className="chrome-status">
          <div className="chrome-status-group">
            <span className={`connection-led ${isWsConnected ? "is-connected" : ""}`} />
            <span>{isWsConnected ? "WS: CONNECTED" : "WS: DISCONNECTED"}</span>
          </div>
          <span className="chrome-separator" />
          <span>Sessions: <strong>{sessionsCount}</strong></span>
          <span className="chrome-separator" />
          <span>Listeners: <strong>{activeListenersCount}</strong></span>
          <span className="chrome-separator" />
          <span>{currentLag}ms lag</span>
        </div>
      </div>

      <Toolbar className="quick-toolbar">
        <div className="toolbar-group">
          <CompactIconButton
            onClick={isWsConnected ? onDisconnectWs : onConnectWs}
            title={isWsConnected ? "Disconnect from TeamServer" : "Connect to TeamServer"}
            aria-label={isWsConnected ? "Disconnect from TeamServer" : "Connect to TeamServer"}
            className={isWsConnected ? "is-active" : ""}
          >
            <Zap />
          </CompactIconButton>
          
          <span className="toolbar-separator" />

          <CompactIconButton
            onClick={() => onAddTab("listeners", "C2 Listeners")}
            title="Configure C2 Listeners"
            aria-label="Configure C2 Listeners"
          >
            <Radio />
          </CompactIconButton>

          <CompactIconButton
            onClick={() => onAddTab("sessions", "Active Sessions")}
            title="View Active Sessions"
            aria-label="View Active Sessions"
          >
            <TerminalSquare />
          </CompactIconButton>

          <CompactIconButton
            onClick={() => onAddTab("loots", "Secrets")}
            title="Secrets"
            aria-label="Secrets"
          >
            <Key />
          </CompactIconButton>

          <CompactIconButton
            onClick={() => onAddTab("downloads", "Looted Files")}
            title="Loot: Downloaded Target Files"
            aria-label="Downloaded Target Files"
          >
            <Download />
          </CompactIconButton>

          <CompactIconButton
            onClick={() => onAddTab("images", "Device Images")}
            title="Images collected from devices"
            aria-label="Device Images"
          >
            <Camera />
          </CompactIconButton>

          <CompactIconButton
            onClick={() => onAddTab("scripts", "Lua Script Manager")}
            title="Manage Lua Scripts"
            aria-label="Manage Lua Scripts"
          >
            <FileCode />
          </CompactIconButton>

          <CompactIconButton
            onClick={() => onAddTab("users", "User Management")}
            title="Manage TeamServer Users"
            aria-label="Manage TeamServer Users"
          >
            <UsersRound />
          </CompactIconButton>

          <CompactIconButton
            onClick={() => onAddTab("event_log", "Team Server Event Log")}
            title="Chat and system event log"
            aria-label="Chat and System Event Log"
          >
            <MessageSquare />
          </CompactIconButton>

          <CompactIconButton
            onClick={() => onAddTab("packets", "Event Monitor")}
            title="Event Monitor"
            aria-label="Event Monitor"
          >
            <Activity />
          </CompactIconButton>

          <span className="toolbar-separator" />

          <CompactIconButton
            onClick={onTriggerPayloadModal}
            title="Generate Encrypted C2 Agent Executable"
            aria-label="Generate Encrypted C2 Agent Executable"
          >
            <Server />
          </CompactIconButton>
        </div>

        <div className="toolbar-group">
          <CompactIconButton
            onClick={onTriggerSettingsModal}
            title="PurpleCommand Configuration Panel"
            aria-label="PurpleCommand Configuration Panel"
          >
            <Settings />
          </CompactIconButton>
        </div>
      </Toolbar>
    </header>
  );
};
