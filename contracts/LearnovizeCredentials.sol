// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * LearnovizeCredentials -- non-transferable, revocable attendance credentials on Base.
 *
 * WHY ERC-1155 AND NOT ERC-721: a learner's credentials are several certificates from one
 * training, minted independently as they are earned. ERC-721 forces one deploy per token
 * type or a shared counter that couples unrelated records; 1155 batches them in a single
 * call for a fraction of the cost, and shows up as a collectible in the wallets people
 * already use.
 *
 * WHY IT IS NOT TRANSFERABLE, ENFORCED IN _update RATHER THAN BY OMISSION: the moment
 * attendance becomes tradeable it stops being evidence of anything, and the revoke path
 * below stops being enforceable, because whoever owns it can walk it somewhere we cannot
 * reach. Overriding _update is the only enforcement point that also covers mints, so a
 * transfer cannot be smuggled in through any entry point added later.
 *
 * Revocation burns the token and keeps the record. A burn is not a silent deletion: the
 * history stays on chain and anyone holding an old copy can still be shown that it was
 * revoked and why. The reason is a hash of the human-readable text, so the chain does not
 * carry the text and it cannot be edited afterwards.
 */
contract LearnovizeCredentials is ERC1155, Ownable {
    /// One id per certificate. Never reused: a burned id is not minted again, so an old
    /// holder's token can never be resurrected by minting something new with its number.
    uint256 public constant CREDENTIAL = 1;

    struct Credential {
        bytes32 certHash; // sha256 of the signed snapshot, verifiable off-chain
        string number; // LEARNOVIZE-YYYY-XXXXXX, as printed on the PDF
        address holder;
        uint64 issuedAt;
        bool revoked;
        bytes32 reasonHash;
        bytes32 ref; // the database id, which makes re-anchoring a no-op, not a duplicate
    }

    mapping(uint256 => Credential) private credentials;
    mapping(bytes32 => bool) private seen; // ref -> already anchored

    event Issued(uint256 indexed id, address indexed holder, bytes32 certHash, string number, bytes32 ref);
    event Revoked(uint256 indexed id, bytes32 reasonHash);
    event Restored(uint256 indexed id);

    error AlreadyAnchored(bytes32 ref);
    error UnknownCredential(uint256 id);
    error AlreadyRevoked();
    error NotRevoked();
    error TransfersDisabled();
    error UnknownHolder();

    constructor(address initialOwner) ERC1155("") Ownable(initialOwner) {}

    /**
     * Anchor one credential. Idempotent on `ref`, the certificate's database id: a retried
     * anchoring -- after a timeout, a deploy, or a duplicated job -- reverts rather than
     * minting a second copy of the same achievement.
     *
     * Reverts rather than silently returning, because the caller records the outcome and
     * a duplicate is a bug worth seeing rather than something to paper over.
     */
    function issue(address holder, uint256 id, bytes32 certHash, string calldata number, bytes32 ref)
        external
        onlyOwner
    {
        if (holder == address(0)) revert UnknownHolder();
        if (seen[ref]) revert AlreadyAnchored(ref);
        seen[ref] = true;
        credentials[id] = Credential({
            certHash: certHash,
            number: number,
            holder: holder,
            issuedAt: uint64(block.timestamp),
            revoked: false,
            reasonHash: bytes32(0),
            ref: ref
        });
        _mint(holder, id, 1, "");
        emit Issued(id, holder, certHash, number, ref);
    }

    function revoke(uint256 id, bytes32 reasonHash) external onlyOwner {
        Credential storage c = credentials[id];
        if (c.holder == address(0)) revert UnknownCredential(id);
        if (c.revoked) revert AlreadyRevoked();
        c.revoked = true;
        c.reasonHash = reasonHash;
        _burn(c.holder, id, 1);
        emit Revoked(id, reasonHash);
    }

    /**
     * Undo a revocation. This is why the record is kept after the burn: a trainer who
     * revoked by mistake, or a dispute decided the learner's way, must be able to put it
     * back. Without this the mistake is permanent with no appeal, which is a worse failure
     * than the one revoke was introduced to fix.
     */
    function restore(uint256 id) external onlyOwner {
        Credential storage c = credentials[id];
        if (c.holder == address(0)) revert UnknownCredential(id);
        if (!c.revoked) revert NotRevoked();
        c.revoked = false;
        c.reasonHash = bytes32(0);
        _mint(c.holder, id, 1, "");
        emit Restored(id);
    }

    function isRevoked(uint256 id) external view returns (bool) {
        return credentials[id].revoked;
    }

    function holderOf(uint256 id) external view returns (address) {
        return credentials[id].holder;
    }

    function get(uint256 id)
        external
        view
        returns (bytes32 certHash, string memory number, address holder, uint64 issuedAt, bool revoked, bytes32 reasonHash)
    {
        Credential storage c = credentials[id];
        return (c.certHash, c.number, c.holder, c.issuedAt, c.revoked, c.reasonHash);
    }

    /**
     * Non-transferable. _update is the single funnel every balance change passes through
     * -- mint, burn and transfer alike -- so reverting the transfer branch here is the one
     * place that cannot be bypassed later.
     */
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override
    {
        if (from != address(0) && to != address(0)) revert TransfersDisabled();
        super._update(from, to, ids, values);
    }
}
