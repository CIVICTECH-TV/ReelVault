import React, { useState } from 'react';
import { TauriCommands } from '../types/tauri-commands';
import type { AwsCredentials, AwsAuthResult, PermissionCheck } from '../types/tauri-commands';
import { AWS_REGIONS, DEFAULT_REGION } from '../constants/aws-regions';
import './AwsAuthSetup.css';

interface AwsAuthSetupProps {
  onAuthSuccess?: (result: AwsAuthResult) => void;
  onCancel?: () => void;
}

const AwsAuthSetup: React.FC<AwsAuthSetupProps> = ({ onAuthSuccess, onCancel }) => {
  const [credentials, setCredentials] = useState<AwsCredentials>({
    access_key_id: '',
    secret_access_key: '',
    region: DEFAULT_REGION,
    session_token: undefined,
  });

  const [authResult, setAuthResult] = useState<AwsAuthResult | null>(null);
  const [permissionCheck, setPermissionCheck] = useState<PermissionCheck | null>(null);
  const [bucketName, setBucketName] = useState('');
  const [profileName, setProfileName] = useState('default');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (field: keyof AwsCredentials, value: string) => {
    setCredentials(prev => ({
      ...prev,
      [field]: value === '' ? undefined : value,
    }));
  };

  const handleAuthenticate = async () => {
    setIsLoading(true);
    setError(null);
    setAuthResult(null);
    setPermissionCheck(null);

    try {
      const result = await TauriCommands.authenticateAws(credentials);
      setAuthResult(result);

      if (result.success && onAuthSuccess) {
        onAuthSuccess(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestBucketAccess = async () => {
    if (!bucketName) {
      setError('Please enter a bucket name');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await TauriCommands.testS3BucketAccess(credentials, bucketName);
      setPermissionCheck(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bucket access test failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveCredentials = async () => {
    if (!authResult?.success) {
      setError('Please authenticate first');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await TauriCommands.saveAwsCredentialsSecure(credentials, profileName);
      alert(`Credentials saved securely as profile: ${profileName}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save credentials');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadCredentials = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const loadedCredentials = await TauriCommands.loadAwsCredentialsSecure(profileName);
      setCredentials(loadedCredentials);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load credentials');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCredentials = async () => {
    if (!confirm(`Are you sure you want to delete profile: ${profileName}?`)) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await TauriCommands.deleteAwsCredentialsSecure(profileName);
      alert(`Profile deleted: ${profileName}`);
      // プロファイル削除後、フォームをリセット
      setCredentials({
        access_key_id: '',
        secret_access_key: '',
        region: DEFAULT_REGION,
        session_token: undefined,
      });
      setAuthResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete credentials');
    } finally {
      setIsLoading(false);
    }
  };



  return (
    <div className="aws-auth-setup">
      <div className="auth-header">
        <h2>🔐 AWS Authentication Setup</h2>
        <p>Configure your AWS credentials for secure access to S3 Deep Archive</p>
      </div>

      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="form-section">
        <h3>Profile Management</h3>
        <div className="profile-controls">
          <div className="form-group">
            <label htmlFor="profileName">Profile Name:</label>
            <input
              id="profileName"
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="Enter profile name"
            />
          </div>
          <div className="profile-buttons">
            <button 
              onClick={handleLoadCredentials}
              disabled={isLoading || !profileName}
              className="btn-secondary"
            >
              Load Profile
            </button>
            <button 
              onClick={handleDeleteCredentials}
              disabled={isLoading || !profileName}
              className="btn-danger"
            >
              Delete Profile
            </button>
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3>AWS Credentials</h3>
        <div className="form-group">
          <label htmlFor="accessKeyId">Access Key ID:</label>
          <input
            id="accessKeyId"
            type="text"
            value={credentials.access_key_id}
            onChange={(e) => handleInputChange('access_key_id', e.target.value)}
            placeholder="AKIA..."
            autoComplete="username"
          />
        </div>

        <div className="form-group">
          <label htmlFor="secretAccessKey">Secret Access Key:</label>
          <input
            id="secretAccessKey"
            type="password"
            value={credentials.secret_access_key}
            onChange={(e) => handleInputChange('secret_access_key', e.target.value)}
            placeholder="Enter secret access key"
            autoComplete="current-password"
          />
        </div>

        <div className="form-group">
          <label htmlFor="region">AWS Region:</label>
          <select
            id="region"
            value={credentials.region}
            onChange={(e) => handleInputChange('region', e.target.value)}
          >
            {AWS_REGIONS.map(region => (
              <option key={region.code} value={region.code}>
                {region.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="sessionToken">Session Token (Optional):</label>
          <input
            id="sessionToken"
            type="password"
            value={credentials.session_token || ''}
            onChange={(e) => handleInputChange('session_token', e.target.value)}
            placeholder="For temporary credentials"
          />
        </div>

        <button 
          onClick={handleAuthenticate}
          disabled={isLoading || !credentials.access_key_id || !credentials.secret_access_key}
          className="btn-primary auth-button"
        >
          {isLoading ? 'Authenticating...' : '🔐 Authenticate AWS'}
        </button>
      </div>

      {authResult && (
        <div className={`auth-result ${authResult.success ? 'success' : 'failure'}`}>
          <h3>Authentication Result</h3>
          <p><strong>Status:</strong> {authResult.success ? '✅ Success' : '❌ Failed'}</p>
          <p><strong>Message:</strong> {authResult.message}</p>
          
          {authResult.user_identity && (
            <div className="user-identity">
              <h4>User Identity</h4>
              <p><strong>User ID:</strong> {authResult.user_identity.user_id}</p>
              <p><strong>ARN:</strong> {authResult.user_identity.arn}</p>
              <p><strong>Account:</strong> {authResult.user_identity.account}</p>
            </div>
          )}

          {authResult.permissions.length > 0 && (
            <div className="permissions">
              <h4>Available Permissions</h4>
              <ul>
                {authResult.permissions.map((permission, index) => (
                  <li key={index}>{permission}</li>
                ))}
              </ul>
            </div>
          )}

          {authResult.success && (
            <button 
              onClick={handleSaveCredentials}
              disabled={isLoading}
              className="btn-success"
            >
              💾 Save Credentials Securely
            </button>
          )}
        </div>
      )}

      <div className="form-section">
        <h3>S3 Bucket Access Test</h3>
        <div className="bucket-test">
          <div className="form-group">
            <label htmlFor="bucketName">S3 Bucket Name:</label>
            <input
              id="bucketName"
              type="text"
              value={bucketName}
              onChange={(e) => setBucketName(e.target.value)}
              placeholder="your-bucket-name"
            />
          </div>
          <button 
            onClick={handleTestBucketAccess}
            disabled={isLoading || !bucketName || !authResult?.success}
            className="btn-secondary"
          >
            🪣 Test Bucket Access
          </button>
        </div>

        {permissionCheck && (
          <div className={`permission-result ${permissionCheck.allowed ? 'allowed' : 'denied'}`}>
            <h4>Bucket Access Test Result</h4>
            <p><strong>Service:</strong> {permissionCheck.service}</p>
            <p><strong>Action:</strong> {permissionCheck.action}</p>
            <p><strong>Resource:</strong> {permissionCheck.resource}</p>
            <p><strong>Access:</strong> {permissionCheck.allowed ? '✅ Allowed' : '❌ Denied'}</p>
          </div>
        )}
      </div>

      <div className="form-actions">
        {onCancel && (
          <button onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};

export default AwsAuthSetup; 