import React from 'react';
import { isDev } from '../utils/debug';

// アイコンのインポート
import statusIcon from '../assets/icons/status.svg';
import settingsIcon from '../assets/icons/settings.svg';
import backupIcon from '../assets/icons/backup.svg';
import restoreIcon from '../assets/icons/restore.svg';
import apiTestIcon from '../assets/icons/api-test.svg';

type ActiveTab = 'status' | 'auth' | 'restore' | 'upload';

interface SidebarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  appVersion: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, appVersion }) => {
  return (
    <div className="sidebar">
      <div className="config-tabs">
        <button
          className={`tab ${activeTab === 'status' ? 'active' : ''}`}
          onClick={() => onTabChange('status')}
        >
          <img src={statusIcon} alt="" className="tab-icon" />
          ステータス
        </button>
        <button
          className={`tab ${activeTab === 'auth' ? 'active' : ''}`}
          onClick={() => onTabChange('auth')}
        >
          <img src={settingsIcon} alt="" className="tab-icon" />
          設定
        </button>
        <button
          className={`tab ${activeTab === 'upload' ? 'active' : ''}`}
          onClick={() => onTabChange('upload')}
        >
          <img src={backupIcon} alt="" className="tab-icon" />
          バックアップ
        </button>
        <button
          className={`tab ${activeTab === 'restore' ? 'active' : ''}`}
          onClick={() => onTabChange('restore')}
        >
          <img src={restoreIcon} alt="" className="tab-icon" />
          リストア
        </button>
      </div>

      <div className="app-info">
        <div className="app-name">ReelVault v{appVersion}</div>
        <div className="app-subtitle">映像制作者のためのアーカイブツール</div>
        <div className="app-copyright">© 2025 CIVICTECH.TV, LLC</div>
      </div>
    </div>
  );
};