/**
 * GitHub API Client
 * Handles repository collaborator invitations via Octokit
 */

import { Octokit } from '@octokit/rest';
import { githubLogger } from '@/lib/logger';

// Initialize Octokit with personal access token
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const GITHUB_OWNER = process.env.GITHUB_ORG_OR_USER || '';
const GITHUB_REPO = process.env.GITHUB_REPO || '';

/**
 * Invite user to repository as collaborator
 * Permission level: 'pull' (read-only)
 */
export async function inviteToRepository(
  username: string,
  permission: 'pull' | 'push' | 'admin' = 'pull'
): Promise<{
  success: boolean;
  message: string;
  invitationId?: string;
  error?: string;
}> {
  try {
    // Check if user is already a collaborator
    const existing = await checkIfCollaborator(username);
    if (existing) {
      return {
        success: true,
        message: `User ${username} is already a collaborator`,
      };
    }

    // Send invitation
    const response = await octokit.repos.addCollaborator({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      username,
      permission,
    });

    return {
      success: true,
      message: `Successfully invited ${username} to ${GITHUB_OWNER}/${GITHUB_REPO}`,
      invitationId: response.data.id?.toString(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    githubLogger.error('Failed to invite user to repository', error, { username });

    return {
      success: false,
      message: `Failed to invite ${username}`,
      error: errorMessage,
    };
  }
}

/**
 * Check if user is already a collaborator
 */
export async function checkIfCollaborator(username: string): Promise<boolean> {
  try {
    const response = await octokit.repos.checkCollaborator({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      username,
    });

    return response.status === 204; // 204 = user is a collaborator
  } catch (error) {
    // 404 means user is not a collaborator
    if (error instanceof Error && error.message.includes('404')) {
      return false;
    }

    githubLogger.error('Error checking collaborator status', error, { username });
    return false;
  }
}

/**
 * Get repository information
 */
export async function getRepositoryInfo(): Promise<{
  name: string;
  fullName: string;
  url: string;
  isPrivate: boolean;
}> {
  try {
    const response = await octokit.repos.get({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
    });

    return {
      name: response.data.name,
      fullName: response.data.full_name,
      url: response.data.html_url,
      isPrivate: response.data.private,
    };
  } catch (error) {
    throw new Error(
      `Failed to get repository info: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get all collaborators for the repository
 */
export async function getRepositoryCollaborators(): Promise<
  Array<{
    username: string;
    permission: string;
  }>
> {
  try {
    const response = await octokit.repos.listCollaborators({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
    });

    return response.data.map((collaborator) => ({
      username: collaborator.login,
      permission: collaborator.role_name || 'unknown',
    }));
  } catch (error) {
    throw new Error(
      `Failed to get collaborators: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Remove user from repository
 */
export async function removeFromRepository(username: string): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  try {
    await octokit.repos.removeCollaborator({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      username,
    });

    return {
      success: true,
      message: `Successfully removed ${username} from ${GITHUB_OWNER}/${GITHUB_REPO}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    githubLogger.error('Failed to remove user from repository', error, { username });

    return {
      success: false,
      message: `Failed to remove ${username}`,
      error: errorMessage,
    };
  }
}

/**
 * Get clone URL for repository
 */
export function getRepositoryCloneUrl(): {
  https: string;
  ssh: string;
} {
  return {
    https: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}.git`,
    ssh: `git@github.com:${GITHUB_OWNER}/${GITHUB_REPO}.git`,
  };
}
