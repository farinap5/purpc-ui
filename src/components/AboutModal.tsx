import React from "react";
import packageInfo from "../../package.json";
import { DesktopModal, DesktopPanel } from "./desktop";

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const purpleCommandIcon = new URL("../../img/gomagic.png", import.meta.url).href;

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <DesktopModal
      title="About"
      onClose={onClose}
      width="680px"
      className="about-modal"
    >
      <DesktopPanel className="about-modal-layout">
        <div className="about-modal-artwork" aria-hidden="true">
          <img src={purpleCommandIcon} alt="" />
        </div>

        <div className="about-modal-copy">
          <header>
            <h3>PurpleCommand C2 — Advanced Command &amp; Control Center</h3>
            <p>Cross-platform web and desktop client for PurpleCommand TeamServer.</p>
          </header>

          <dl className="about-modal-details">
            <div>
              <dt>Version</dt>
              <dd>{packageInfo.version}</dd>
            </div>
            <div>
              <dt>Runtime</dt>
              <dd>Wails 2.12 · React 19</dd>
            </div>
          </dl>

          <p>
            PurpleCommand provides a unified operator workspace for sessions, listeners,
            payloads, profiles, collected data, and TeamServer activity.
          </p>

          <p className="about-modal-copyright">© 2026 PurpleCommand</p>
        </div>
      </DesktopPanel>
    </DesktopModal>
  );
};
