import { Request, Response, NextFunction } from "express";
import governanceService, { GovernanceStatus } from "../services/governance.service";

/**
 * GET /api/governance/proposals
 * List all proposals with optional filtering.
 */
export async function getProposals(req: Request, res: Response, next: NextFunction) {
    try {
        // Validate status enum
        const validStatuses = Object.values(GovernanceStatus);
        const rawStatus = req.query.status as string;
        let status: GovernanceStatus | undefined;
        if (rawStatus) {
            if (!validStatuses.includes(rawStatus as GovernanceStatus)) {
                return res.status(400).json({
                    success: false,
                    error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`
                });
            }
            status = rawStatus as GovernanceStatus;
        }

        // Validate limit and offset
        let limit: number | undefined;
        let offset: number | undefined;
        
        if (req.query.limit) {
            limit = parseInt(req.query.limit as string, 10);
            if (isNaN(limit) || limit < 1) {
                return res.status(400).json({
                    success: false,
                    error: "limit must be a positive number"
                });
            }
        }
        
        if (req.query.offset) {
            offset = parseInt(req.query.offset as string, 10);
            if (isNaN(offset) || offset < 0) {
                return res.status(400).json({
                    success: false,
                    error: "offset must be a non-negative number"
                });
            }
        }

        const filters = {
            status,
            proposerId: req.query.proposerId as string | undefined,
            limit,
            offset
        };

        const { proposals, total } = await governanceService.getProposals(filters);

        res.json({
            success: true,
            data: proposals,
            meta: {
                total,
                limit: filters.limit ?? 20,
                offset: filters.offset ?? 0
            }
        });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/governance/proposals
 * Create a new governance proposal.
 */
export async function createProposal(req: Request, res: Response, next: NextFunction) {
    try {
        const { title, description, quorum, deadline, contractId } = req.body;
        const proposerId = req.user!.userId;

        if (!title || !description || !quorum) {
            return res.status(400).json({
                success: false,
                error: "Missing required fields: title, description, quorum"
            });
        }

        // Validate quorum is a valid decimal
        const quorumNum = parseFloat(quorum);
        if (isNaN(quorumNum) || quorumNum <= 0) {
            return res.status(400).json({
                success: false,
                error: "quorum must be a positive decimal number"
            });
        }

        // Validate deadline if provided
        let deadlineDate: Date | undefined;
        if (deadline) {
            deadlineDate = new Date(deadline);
            if (isNaN(deadlineDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    error: "deadline must be a valid date string"
                });
            }
            if (deadlineDate <= new Date()) {
                return res.status(400).json({
                    success: false,
                    error: "deadline must be in the future"
                });
            }
        }

        const { proposal } = await governanceService.createProposal({
            title,
            description,
            proposerId,
            endsAt: deadlineDate ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            contractId
        });

        res.status(201).json({
            success: true,
            data: {
                proposalId: proposal.id,
                proposal,
            }
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/governance/proposals/:id
 * Get a single proposal by ID.
 */
export async function getProposal(req: Request, res: Response, next: NextFunction) {
    try {
        const { id } = req.params;
        const proposal = await governanceService.getProposalById(id);

        res.json({
            success: true,
            data: proposal
        });
    } catch (err) {
        if ((err as Error).message === "Proposal not found") {
            return res.status(404).json({
                success: false,
                error: "Proposal not found"
            });
        }
        next(err);
    }
}

/**
 * GET /api/governance/proposals/:id/votes
 * Get all votes for a proposal.
 */
export async function getProposalVotes(req: Request, res: Response, next: NextFunction) {
    try {
        const { id } = req.params;
        
        // Parse pagination params
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
        const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
        
        const { votes, total, limit: appliedLimit, offset: appliedOffset } = await governanceService.getProposalVotes(id, { limit, offset });

        res.json({
            success: true,
            data: votes,
            meta: {
                total,
                limit: appliedLimit,
                offset: appliedOffset
            }
        });
    } catch (err) {
        if ((err as Error).message === "Proposal not found") {
            return res.status(404).json({
                success: false,
                error: "Proposal not found"
            });
        }
        next(err);
    }
}

/**
 * POST /api/governance/votes
 * Cast a vote on a proposal.
 */
export async function submitVote(req: Request, res: Response, next: NextFunction) {
    try {
        const { proposalId, voteFor, weight } = req.body;
        const voterId = req.user!.userId;

        if (!proposalId || typeof voteFor !== "boolean" || !weight) {
            return res.status(400).json({
                success: false,
                error: "Missing required fields: proposalId, voteFor, weight"
            });
        }

        const { vote } = await governanceService.castVote({
            proposalId,
            voterAddress: voterId,
            vote: voteFor ? "YES" : "NO",
            weight: String(weight),
        });
        const xdr: string | undefined = undefined;

        res.status(201).json({
            success: true,
            data: {
                vote,
                xdr
            }
        });
    } catch (err) {
        const error = err as Error;
        
        // Handle duplicate vote (409)
        if ((error as any).statusCode === 409) {
            return res.status(409).json({
                success: false,
                error: error.message
            });
        }

        // Handle proposal not found (404)
        if (error.message === "Proposal not found") {
            return res.status(404).json({
                success: false,
                error: "Proposal not found"
            });
        }

        // Handle closed proposal or deadline passed (400)
        if (error.message.includes("Cannot vote on proposal") || error.message.includes("deadline has passed")) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        next(err);
    }
}

/**
 * GET /api/governance/metrics
 * Get protocol governance health metrics.
 */
export async function getMetrics(req: Request, res: Response, next: NextFunction) {
    try {
        const metrics = await governanceService.getMetrics();

        res.json({
            success: true,
            data: metrics
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/governance/parameters
 * Get current on-chain governance parameters.
 */
export async function getParameters(req: Request, res: Response, next: NextFunction) {
    try {
        const parameters = await governanceService.getParameters();

        res.json({
            success: true,
            data: parameters
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/governance/audit
 * Get audit log of all governance actions.
 */
export async function getAuditLog(req: Request, res: Response, next: NextFunction) {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
        const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;

        const auditLog = await governanceService.getAuditLog({ limit, offset });

        res.json({
            success: true,
            data: auditLog.offChain,
            meta: {
                onChainEvents: auditLog.onChain,
                total: auditLog.total,
                limit: auditLog.limit,
                offset: auditLog.offset
            }
        });
    } catch (err) {
        next(err);
    }
}
