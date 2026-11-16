import { useId, useState } from "react";
import type { Session } from "../types/session";
import { SessionCard } from "./SessionCard";

interface Props {
  domain: string;
  sessions: Session[];
  tabId: number;
  onUpdate: () => void;
  onRequestConfirm: (message: string, action: () => void) => void;
}

export function DomainGroup({
  domain,
  sessions,
  tabId,
  onUpdate,
  onRequestConfirm,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const contentId = useId();

  return (
    <div className="domain-group">
      <button
        className="domain-header"
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
        aria-controls={contentId}
      >
        <span className="domain-chevron" aria-hidden="true" />
        <span className="domain-name" title={domain}>{domain}</span>
        <span className="domain-count">
          {sessions.length} session{sessions.length !== 1 ? "s" : ""}
        </span>
      </button>

      <div className="domain-collapse" data-collapsed={collapsed} inert={collapsed} id={contentId}>
        <div className="domain-sessions">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              tabId={tabId}
              onUpdate={onUpdate}
              onRequestConfirm={onRequestConfirm}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
