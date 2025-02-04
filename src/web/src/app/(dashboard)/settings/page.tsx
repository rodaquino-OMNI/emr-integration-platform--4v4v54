'use client';

import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast'; // v2.4.1
import { AuditLogger } from '@hipaa/audit-logger'; // v1.2.0
import Card from '@/components/common/Card';
import { useAuth } from '@/hooks/useAuth';
import { THEME, EMR_SYSTEMS } from '@/lib/constants';
import { UserRole } from '@/lib/types';

// Initialize HIPAA-compliant audit logger
const auditLogger = new AuditLogger({
  service: 'settings-page',
  retentionDays: 365,
  encryptionEnabled: true
});

interface UserSettings {
  notificationsEnabled: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
  theme: 'light' | 'dark' | 'system';
  language: string;
  taskRefreshInterval: number;
  hipaaCompliance: {
    acknowledgement: boolean;
    lastTrainingDate: string;
  };
  departmentSettings: {
    id: string;
    preferences: Record<string, any>;
  };
  auditLogging: {
    enabled: boolean;
    retentionDays: number;
  };
}

interface SystemSettings {
  maxTasksPerUser: number;
  handoverWindowMinutes: number;
  taskLockTimeoutSeconds: number;
  emrSyncIntervalMinutes: number;
  emrIntegration: {
    endpoint: string;
    timeout: number;
    retryAttempts: number;
  };
  securityParams: {
    sessionTimeout: number;
    passwordPolicy: Record<string, any>;
  };
  complianceMonitoring: {
    enabled: boolean;
    alertThresholds: Record<string, number>;
  };
  departmentConfig: {
    settings: Record<string, any>[];
    access: Record<string, string[]>;
  };
}

const SettingsPage: React.FC = () => {
  const { user, checkPermission } = useAuth();
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsLoading(true);
        // Load user settings
        const userSettingsResponse = await fetch('/api/settings/user');
        const userSettingsData = await userSettingsResponse.json();
        setUserSettings(userSettingsData);

        // Load system settings if user has admin access
        if (checkPermission([UserRole.ADMINISTRATOR]).granted) {
          const systemSettingsResponse = await fetch('/api/settings/system');
          const systemSettingsData = await systemSettingsResponse.json();
          setSystemSettings(systemSettingsData);
        }
      } catch (error) {
        toast.error('Failed to load settings');
        auditLogger.error('Settings load failed', { error, userId: user?.id });
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [user, checkPermission]);

  const handleUserSettingsUpdate = async (settings: Partial<UserSettings>) => {
    try {
      const response = await fetch('/api/settings/user', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!response.ok) throw new Error('Failed to update settings');

      setUserSettings(prev => ({ ...prev!, ...settings }));
      toast.success('Settings updated successfully');
      
      auditLogger.info('User settings updated', {
        userId: user?.id,
        changes: settings,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      toast.error('Failed to update settings');
      auditLogger.error('Settings update failed', { error, userId: user?.id });
    }
  };

  const handleSystemSettingsUpdate = async (settings: Partial<SystemSettings>) => {
    try {
      if (!checkPermission([UserRole.ADMINISTRATOR]).granted) {
        throw new Error('Insufficient permissions');
      }

      const response = await fetch('/api/settings/system', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!response.ok) throw new Error('Failed to update system settings');

      setSystemSettings(prev => ({ ...prev!, ...settings }));
      toast.success('System settings updated successfully');

      auditLogger.info('System settings updated', {
        userId: user?.id,
        changes: settings,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      toast.error('Failed to update system settings');
      auditLogger.error('System settings update failed', { error, userId: user?.id });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card loading testId="user-settings-loading" />
        {checkPermission([UserRole.ADMINISTRATOR]).granted && (
          <Card loading testId="system-settings-loading" />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {/* User Settings Section */}
      <Card title="User Preferences" testId="user-settings">
        <div className="space-y-4">
          {/* Notification Settings */}
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Notifications</h3>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={userSettings?.notificationsEnabled}
                onChange={e => handleUserSettingsUpdate({ notificationsEnabled: e.target.checked })}
                className="form-checkbox"
              />
              <span>Enable Notifications</span>
            </label>
          </div>

          {/* HIPAA Compliance Settings */}
          <div className="space-y-2">
            <h3 className="text-lg font-medium">HIPAA Compliance</h3>
            <div className="bg-blue-50 p-4 rounded-md">
              <p className="text-sm">
                Last Training: {userSettings?.hipaaCompliance.lastTrainingDate}
              </p>
              <label className="flex items-center space-x-2 mt-2">
                <input
                  type="checkbox"
                  checked={userSettings?.hipaaCompliance.acknowledgement}
                  onChange={e => handleUserSettingsUpdate({
                    hipaaCompliance: {
                      ...userSettings?.hipaaCompliance!,
                      acknowledgement: e.target.checked
                    }
                  })}
                  className="form-checkbox"
                />
                <span>I acknowledge HIPAA compliance requirements</span>
              </label>
            </div>
          </div>

          {/* Department Settings */}
          {user?.department && (
            <div className="space-y-2">
              <h3 className="text-lg font-medium">Department Settings</h3>
              <div className="bg-gray-50 p-4 rounded-md">
                <p className="text-sm">Department: {user.department}</p>
                {/* Department-specific settings */}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* System Settings Section - Admin Only */}
      {checkPermission([UserRole.ADMINISTRATOR]).granted && systemSettings && (
        <Card title="System Settings" testId="system-settings">
          <div className="space-y-6">
            {/* EMR Integration Settings */}
            <div className="space-y-2">
              <h3 className="text-lg font-medium">EMR Integration</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium">EMR System</label>
                  <select
                    value={systemSettings.emrIntegration.endpoint}
                    onChange={e => handleSystemSettingsUpdate({
                      emrIntegration: {
                        ...systemSettings.emrIntegration,
                        endpoint: e.target.value
                      }
                    })}
                    className="mt-1 block w-full rounded-md border-gray-300"
                  >
                    {Object.values(EMR_SYSTEMS).map(system => (
                      <option key={system} value={system}>{system}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium">Sync Interval (minutes)</label>
                  <input
                    type="number"
                    value={systemSettings.emrSyncIntervalMinutes}
                    onChange={e => handleSystemSettingsUpdate({
                      emrSyncIntervalMinutes: parseInt(e.target.value)
                    })}
                    className="mt-1 block w-full rounded-md border-gray-300"
                  />
                </div>
              </div>
            </div>

            {/* Compliance Monitoring */}
            <div className="space-y-2">
              <h3 className="text-lg font-medium">Compliance Monitoring</h3>
              <div className="bg-yellow-50 p-4 rounded-md">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={systemSettings.complianceMonitoring.enabled}
                    onChange={e => handleSystemSettingsUpdate({
                      complianceMonitoring: {
                        ...systemSettings.complianceMonitoring,
                        enabled: e.target.checked
                      }
                    })}
                    className="form-checkbox"
                  />
                  <span>Enable Compliance Monitoring</span>
                </label>
              </div>
            </div>

            {/* Security Parameters */}
            <div className="space-y-2">
              <h3 className="text-lg font-medium">Security Settings</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium">Session Timeout (minutes)</label>
                  <input
                    type="number"
                    value={systemSettings.securityParams.sessionTimeout / 60}
                    onChange={e => handleSystemSettingsUpdate({
                      securityParams: {
                        ...systemSettings.securityParams,
                        sessionTimeout: parseInt(e.target.value) * 60
                      }
                    })}
                    className="mt-1 block w-full rounded-md border-gray-300"
                  />
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default SettingsPage;