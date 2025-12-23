import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class GitHelper {
  constructor(private readonly workspaceRoot: string) {}

  private async execGit(command: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`git ${command}`, {
        cwd: this.workspaceRoot
      });
      return stdout.trim();
    } catch (error: any) {
      throw new Error(`Git command failed: ${error.message}`);
    }
  }

  async isGitRepo(): Promise<boolean> {
    try {
      await this.execGit('rev-parse --git-dir');
      return true;
    } catch {
      return false;
    }
  }

  async getCurrentBranch(): Promise<string> {
    return this.execGit('rev-parse --abbrev-ref HEAD');
  }

  async listBranches(): Promise<string[]> {
    const output = await this.execGit('branch --list --format="%(refname:short)"');
    return output.split('\n').filter(Boolean);
  }

  async branchExists(branchName: string): Promise<boolean> {
    try {
      await this.execGit(`rev-parse --verify ${branchName}`);
      return true;
    } catch {
      return false;
    }
  }

  async createBranch(branchName: string): Promise<void> {
    await this.execGit(`branch ${branchName}`);
  }

  async checkoutBranch(branchName: string): Promise<void> {
    await this.execGit(`checkout ${branchName}`);
  }

  async createAndCheckoutBranch(branchName: string): Promise<void> {
    const exists = await this.branchExists(branchName);
    if (exists) {
      throw new Error(`Branch '${branchName}' already exists`);
    }
    await this.execGit(`checkout -b ${branchName}`);
  }

  async hasUncommittedChanges(): Promise<boolean> {
    try {
      const output = await this.execGit('status --porcelain');
      return output.length > 0;
    } catch {
      return false;
    }
  }
}

