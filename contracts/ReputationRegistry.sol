// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ReputationRegistry
 * @notice Minimal ERC-8004 style reputation registry for the Obolark agent economy.
 *         Clients credit sellers with a 0-100 score after a paid x402 crossing.
 *
 * @dev    Hand-written for Obolark (ChaosChain reference impl was unreachable
 *         at deploy-time — see REPUTATION_DEPLOY.md). MIT licensed. Author:
 *         Atlas (Obolark build agent, PA·co). No IdentityRegistry dependency —
 *         agent IDs come from the offchain `src/config/agent-ids.json` shim
 *         (index 1..22 mapped to our 22 Circle MPC wallets).
 *
 *         Storage is intentionally append-only. There is no admin, no owner,
 *         no score mutability, no pausing. Anyone holding an agent wallet can
 *         credit any seller. This is fine for a testnet demo on Arc.
 */
contract ReputationRegistry {
    struct Feedback {
        uint256 clientAgentId;
        uint256 serverAgentId;
        uint8 score;
        uint64 timestamp;
    }

    /// @dev serverAgentId => list of feedback entries received
    mapping(uint256 => Feedback[]) private _feedback;

    /// @dev total feedback count across all sellers (for quick stats)
    uint256 public totalFeedback;

    event FeedbackGiven(
        uint256 indexed clientAgentId,
        uint256 indexed serverAgentId,
        uint8 score,
        uint64 timestamp
    );

    /**
     * @notice Record a feedback entry for `serverAgentId` from `clientAgentId`.
     * @param clientAgentId The offchain-mapped ID of the paying agent.
     * @param serverAgentId The offchain-mapped ID of the seller agent.
     * @param score A reputation score in the range [0, 100]. Values >100 revert.
     */
    function giveFeedback(
        uint256 clientAgentId,
        uint256 serverAgentId,
        uint8 score
    ) external {
        require(score <= 100, "score out of range");
        require(serverAgentId != 0, "serverAgentId=0");

        Feedback memory entry = Feedback({
            clientAgentId: clientAgentId,
            serverAgentId: serverAgentId,
            score: score,
            timestamp: uint64(block.timestamp)
        });
        _feedback[serverAgentId].push(entry);
        unchecked { totalFeedback++; }

        emit FeedbackGiven(clientAgentId, serverAgentId, score, entry.timestamp);
    }

    /**
     * @notice Return all feedback entries recorded for a seller.
     * @dev Intended for offchain reads — unbounded loop on very large arrays.
     */
    function getFeedback(uint256 serverAgentId)
        external
        view
        returns (Feedback[] memory)
    {
        return _feedback[serverAgentId];
    }

    /// @notice Number of feedback entries for a given seller.
    function feedbackCount(uint256 serverAgentId) external view returns (uint256) {
        return _feedback[serverAgentId].length;
    }
}
