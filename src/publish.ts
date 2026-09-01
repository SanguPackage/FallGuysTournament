import { $ } from "bun";
import { checkData, type DataProblem } from "./data-check";

/** The git commands publishing needs, so the decisions around them can be tested without a repo. */
export interface Git {
  add(paths: string[]): Promise<void>;
  /** Whether those paths have staged changes, so an empty commit is never attempted. */
  staged(paths: string[]): Promise<boolean>;
  commit(message: string, paths: string[]): Promise<void>;
  remotes(): Promise<string>;
  push(): Promise<void>;
}

export interface PublishResult {
  committed: boolean;
  pushed: boolean;
  message: string;
}

export const DATA = "data";

export const realGit: Git = {
  add: async (paths) => void (await $`git add ${paths}`.quiet()),
  staged: async (paths) => !!(await $`git diff --cached --quiet -- ${paths}`.nothrow().quiet()).exitCode,
  commit: async (message, paths) => void (await $`git commit -m ${message} -- ${paths}`.quiet()),
  remotes: async () => (await $`git remote`.text()).trim(),
  push: async () => void (await $`git push`.quiet()),
};

export async function publish(
  message: string,
  git: Git = realGit,
  check: () => Promise<DataProblem[]> = () => checkData(DATA),
): Promise<PublishResult> {
  const subject = message.trim();
  if (!subject) throw new Error("A commit message is required.");

  // Once pushed the board serves this to everyone watching, and there is no step after it.
  const problems = await check();
  if (problems.length > 0) {
    const named = problems.map(({ file, problem }) => `${file}: ${problem}`).join("; ");
    return { committed: false, pushed: false, message: `Not published — ${named}` };
  }

  await git.add([DATA]);
  if (!(await git.staged([DATA]))) {
    return { committed: false, pushed: false, message: "Nothing to commit." };
  }

  await git.commit(subject, [DATA]);

  if (!(await git.remotes())) {
    return {
      committed: true,
      pushed: false,
      message: "Committed. There is no git remote, so nothing was pushed.",
    };
  }

  try {
    await git.push();
  } catch {
    return {
      committed: true,
      pushed: false,
      message: "Committed, but the push failed. Push manually when you have a connection.",
    };
  }

  return { committed: true, pushed: true, message: "Committed and pushed." };
}
