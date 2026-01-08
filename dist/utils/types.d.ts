import type * as github from "@actions/github";
export type Octokit = ReturnType<typeof github.getOctokit>;
export interface Config {
    provider: string;
    customPrompt?: string;
    githubUsername: string;
    reviewOnOpen: boolean;
    reviewOnUpdate: boolean;
    maxBudgetUsd: number;
    autoMerge: boolean;
    mergeMethod: "merge" | "squash" | "rebase";
    anthropicApiKey?: string;
    openrouterApiKey?: string;
    githubToken: string;
}
//# sourceMappingURL=types.d.ts.map