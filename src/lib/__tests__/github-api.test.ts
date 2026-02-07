/**
 * GitHub API Tests
 * Tests for GitHub repository operations with mocked Octokit
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks - these run before any imports
const {
  mockAddCollaborator,
  mockCheckCollaborator,
  mockGet,
  mockListCollaborators,
  mockRemoveCollaborator,
  mockGithubLogger,
} = vi.hoisted(() => ({
  mockAddCollaborator: vi.fn(),
  mockCheckCollaborator: vi.fn(),
  mockGet: vi.fn(),
  mockListCollaborators: vi.fn(),
  mockRemoveCollaborator: vi.fn(),
  mockGithubLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock Octokit
vi.mock('@octokit/rest', () => ({
  Octokit: class MockOctokit {
    repos = {
      addCollaborator: mockAddCollaborator,
      checkCollaborator: mockCheckCollaborator,
      get: mockGet,
      listCollaborators: mockListCollaborators,
      removeCollaborator: mockRemoveCollaborator,
    };
  },
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  githubLogger: mockGithubLogger,
}));

describe('GitHub API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_TOKEN = 'ghp_test_token_123';
    process.env.GITHUB_ORG_OR_USER = 'test-org';
    process.env.GITHUB_REPO = 'test-repo';
  });

  describe('inviteToRepository', () => {
    it('should invite new user successfully', async () => {
      // User is not a collaborator
      mockCheckCollaborator.mockRejectedValueOnce(new Error('Not Found - 404'));

      // Invitation succeeds
      mockAddCollaborator.mockResolvedValueOnce({
        data: { id: 12345 },
        status: 201,
      });

      const githubApi = await import('@/lib/github-api');
      const result = await githubApi.inviteToRepository('newuser');

      expect(result).toEqual({
        success: true,
        message: 'Successfully invited newuser to test-org/test-repo',
        invitationId: '12345',
      });

      expect(mockAddCollaborator).toHaveBeenCalledWith({
        owner: 'test-org',
        repo: 'test-repo',
        username: 'newuser',
        permission: 'pull',
      });
    });

    it('should invite with custom permission level', async () => {
      mockCheckCollaborator.mockRejectedValueOnce(new Error('Not Found - 404'));

      mockAddCollaborator.mockResolvedValueOnce({
        data: { id: 67890 },
        status: 201,
      });

      const githubApi = await import('@/lib/github-api');
      const result = await githubApi.inviteToRepository('admin-user', 'admin');

      expect(result.success).toBe(true);
      expect(mockAddCollaborator).toHaveBeenCalledWith(
        expect.objectContaining({
          permission: 'admin',
        })
      );
    });

    it('should skip invitation if user is already a collaborator', async () => {
      // User is already a collaborator
      mockCheckCollaborator.mockResolvedValueOnce({
        status: 204,
      });

      const githubApi = await import('@/lib/github-api');
      const result = await githubApi.inviteToRepository('existing-user');

      expect(result).toEqual({
        success: true,
        message: 'User existing-user is already a collaborator',
      });

      expect(mockAddCollaborator).not.toHaveBeenCalled();
    });

    it('should handle GitHub API errors', async () => {
      mockCheckCollaborator.mockRejectedValueOnce(new Error('Not Found - 404'));

      mockAddCollaborator.mockRejectedValueOnce(
        new Error('Resource not accessible by integration')
      );

      const githubApi = await import('@/lib/github-api');
      const result = await githubApi.inviteToRepository('testuser');

      expect(result).toEqual({
        success: false,
        message: 'Failed to invite testuser',
        error: 'Resource not accessible by integration',
      });

      expect(mockGithubLogger.error).toHaveBeenCalledWith(
        'Failed to invite user to repository',
        expect.any(Error),
        { username: 'testuser' }
      );
    });

    it('should handle unknown errors', async () => {
      mockCheckCollaborator.mockRejectedValueOnce(new Error('Not Found - 404'));

      mockAddCollaborator.mockRejectedValueOnce('String error');

      const githubApi = await import('@/lib/github-api');
      const result = await githubApi.inviteToRepository('testuser');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });

    it('should handle invitation response without ID', async () => {
      mockCheckCollaborator.mockRejectedValueOnce(new Error('Not Found - 404'));

      mockAddCollaborator.mockResolvedValueOnce({
        data: {},
        status: 201,
      });

      const githubApi = await import('@/lib/github-api');
      const result = await githubApi.inviteToRepository('testuser');

      expect(result.success).toBe(true);
      expect(result.invitationId).toBeUndefined();
    });
  });

  describe('checkIfCollaborator', () => {
    it('should return true for existing collaborator', async () => {
      mockCheckCollaborator.mockResolvedValueOnce({
        status: 204,
      });

      const githubApi = await import('@/lib/github-api');
      const result = await githubApi.checkIfCollaborator('existinguser');

      expect(result).toBe(true);
      expect(mockCheckCollaborator).toHaveBeenCalledWith({
        owner: 'test-org',
        repo: 'test-repo',
        username: 'existinguser',
      });
    });

    it('should return false for non-collaborator (404)', async () => {
      mockCheckCollaborator.mockRejectedValueOnce(new Error('Not Found - 404'));

      const githubApi = await import('@/lib/github-api');
      const result = await githubApi.checkIfCollaborator('newuser');

      expect(result).toBe(false);
    });

    it('should return false and log on other errors', async () => {
      mockCheckCollaborator.mockRejectedValueOnce(new Error('Internal Server Error'));

      const githubApi = await import('@/lib/github-api');
      const result = await githubApi.checkIfCollaborator('testuser');

      expect(result).toBe(false);
      expect(mockGithubLogger.error).toHaveBeenCalledWith(
        'Error checking collaborator status',
        expect.any(Error),
        { username: 'testuser' }
      );
    });

    it('should handle non-error rejections', async () => {
      mockCheckCollaborator.mockRejectedValueOnce('String error');

      const githubApi = await import('@/lib/github-api');
      const result = await githubApi.checkIfCollaborator('testuser');

      expect(result).toBe(false);
    });
  });

  describe('getRepositoryInfo', () => {
    it('should return repository information', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          name: 'test-repo',
          full_name: 'test-org/test-repo',
          html_url: 'https://github.com/test-org/test-repo',
          private: true,
        },
        status: 200,
      });

      const githubApi = await import('@/lib/github-api');
      const result = await githubApi.getRepositoryInfo();

      expect(result).toEqual({
        name: 'test-repo',
        fullName: 'test-org/test-repo',
        url: 'https://github.com/test-org/test-repo',
        isPrivate: true,
      });

      expect(mockGet).toHaveBeenCalledWith({
        owner: 'test-org',
        repo: 'test-repo',
      });
    });

    it('should handle public repositories', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          name: 'public-repo',
          full_name: 'org/public-repo',
          html_url: 'https://github.com/org/public-repo',
          private: false,
        },
        status: 200,
      });

      const githubApi = await import('@/lib/github-api');
      const result = await githubApi.getRepositoryInfo();

      expect(result.isPrivate).toBe(false);
    });

    it('should throw error on API failure', async () => {
      mockGet.mockRejectedValueOnce(new Error('Repository not found'));

      const githubApi = await import('@/lib/github-api');
      await expect(githubApi.getRepositoryInfo()).rejects.toThrow(
        'Failed to get repository info: Repository not found'
      );
    });

    it('should handle unknown errors', async () => {
      mockGet.mockRejectedValueOnce('Non-error object');

      const githubApi = await import('@/lib/github-api');
      await expect(githubApi.getRepositoryInfo()).rejects.toThrow(
        'Failed to get repository info: Unknown error'
      );
    });
  });

  describe('getRepositoryCollaborators', () => {
    it('should return list of collaborators', async () => {
      mockListCollaborators.mockResolvedValueOnce({
        data: [
          { login: 'user1', role_name: 'admin' },
          { login: 'user2', role_name: 'read' },
          { login: 'user3', role_name: 'write' },
        ],
        status: 200,
      });

      const githubApi = await import('@/lib/github-api');
      const result = await githubApi.getRepositoryCollaborators();

      expect(result).toEqual([
        { username: 'user1', permission: 'admin' },
        { username: 'user2', permission: 'read' },
        { username: 'user3', permission: 'write' },
      ]);
    });

    it('should handle collaborators without role_name', async () => {
      mockListCollaborators.mockResolvedValueOnce({
        data: [{ login: 'user1' }, { login: 'user2', role_name: null }],
        status: 200,
      });

      const githubApi = await import('@/lib/github-api');
      const result = await githubApi.getRepositoryCollaborators();

      expect(result).toEqual([
        { username: 'user1', permission: 'unknown' },
        { username: 'user2', permission: 'unknown' },
      ]);
    });

    it('should handle empty collaborator list', async () => {
      mockListCollaborators.mockResolvedValueOnce({
        data: [],
        status: 200,
      });

      const githubApi = await import('@/lib/github-api');
      const result = await githubApi.getRepositoryCollaborators();

      expect(result).toEqual([]);
    });

    it('should throw error on API failure', async () => {
      mockListCollaborators.mockRejectedValueOnce(new Error('Permission denied'));

      const githubApi = await import('@/lib/github-api');
      await expect(githubApi.getRepositoryCollaborators()).rejects.toThrow(
        'Failed to get collaborators: Permission denied'
      );
    });

    it('should throw error with Unknown error for non-Error objects', async () => {
      mockListCollaborators.mockRejectedValueOnce('String error');

      const githubApi = await import('@/lib/github-api');
      await expect(githubApi.getRepositoryCollaborators()).rejects.toThrow(
        'Failed to get collaborators: Unknown error'
      );
    });
  });

  describe('removeFromRepository', () => {
    it('should remove user successfully', async () => {
      mockRemoveCollaborator.mockResolvedValueOnce({
        status: 204,
      });

      const githubApi = await import('@/lib/github-api');
      const result = await githubApi.removeFromRepository('olduser');

      expect(result).toEqual({
        success: true,
        message: 'Successfully removed olduser from test-org/test-repo',
      });

      expect(mockRemoveCollaborator).toHaveBeenCalledWith({
        owner: 'test-org',
        repo: 'test-repo',
        username: 'olduser',
      });
    });

    it('should handle removal errors', async () => {
      mockRemoveCollaborator.mockRejectedValueOnce(new Error('User not found'));

      const githubApi = await import('@/lib/github-api');
      const result = await githubApi.removeFromRepository('nonexistent');

      expect(result).toEqual({
        success: false,
        message: 'Failed to remove nonexistent',
        error: 'User not found',
      });

      expect(mockGithubLogger.error).toHaveBeenCalledWith(
        'Failed to remove user from repository',
        expect.any(Error),
        { username: 'nonexistent' }
      );
    });

    it('should handle unknown errors', async () => {
      mockRemoveCollaborator.mockRejectedValueOnce('String error');

      const githubApi = await import('@/lib/github-api');
      const result = await githubApi.removeFromRepository('testuser');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });
  });

  describe('getRepositoryCloneUrl', () => {
    it('should return HTTPS and SSH clone URLs', async () => {
      const githubApi = await import('@/lib/github-api');
      const result = githubApi.getRepositoryCloneUrl();

      expect(result).toEqual({
        https: 'https://github.com/test-org/test-repo.git',
        ssh: 'git@github.com:test-org/test-repo.git',
      });
    });
  });

  describe('environment variable fallbacks', () => {
    it('should use empty strings when GITHUB_ORG_OR_USER is not set', async () => {
      delete process.env.GITHUB_ORG_OR_USER;
      vi.resetModules();

      const githubApi = await import('@/lib/github-api');
      const result = githubApi.getRepositoryCloneUrl();

      // Should use empty string for owner
      expect(result.https).toBe('https://github.com//test-repo.git');
    });

    it('should use empty strings when GITHUB_REPO is not set', async () => {
      process.env.GITHUB_ORG_OR_USER = 'test-org';
      delete process.env.GITHUB_REPO;
      vi.resetModules();

      const githubApi = await import('@/lib/github-api');
      const result = githubApi.getRepositoryCloneUrl();

      // Should use empty string for repo
      expect(result.https).toBe('https://github.com/test-org/.git');
    });

    it('should use empty strings when both env vars are not set', async () => {
      delete process.env.GITHUB_ORG_OR_USER;
      delete process.env.GITHUB_REPO;
      vi.resetModules();

      const githubApi = await import('@/lib/github-api');
      const result = githubApi.getRepositoryCloneUrl();

      // Both should be empty
      expect(result).toEqual({
        https: 'https://github.com//.git',
        ssh: 'git@github.com:/.git',
      });
    });
  });
});
