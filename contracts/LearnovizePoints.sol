// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * LearnovizePoints -- attendance points on Base.
 *
 * DELIBERATELY NOT AN ERC-20. There is no transfer, no approve, and no allowance. This is
 * a ledger of what a learner has earned and what they have spent inside Learnovize, and
 * it is not a currency. The moment it became transferable it would be a security offered
 * to the public -- a different legal question with a different answer, and one that needs
 * a decision made deliberately rather than inherited from a token template.
 *
 * What learners get from it being on chain is not tradeability, it is proof: a balance
 * nobody has to take our word for, that survives us being wrong about it, and that they
 * can show an employer without logging into our site.
 *
 * The chain is the source of truth for what happened; our database stays the source of
 * truth for *why*. PointsEvent carries the reason, the session and the rule that
 * produced it, and the same events are re-derivable from attendance. The contract only
 * knows about totals, and every credit names the database row it came from so the two can
 * be reconciled.
 */
contract LearnovizePoints {
    address public owner;

    mapping(address => uint256) private balances;
    /// ref (the PointsEvent id) -> credited. One award, one credit, forever.
    mapping(bytes32 => bool) private seen;

    event Credited(address indexed learner, uint256 amount, uint256 balance, uint8 reason, bytes32 indexed ref);
    event Debited(address indexed learner, uint256 amount, uint256 balance, bytes32 indexed reason);
    /// When a correction has to reverse an earlier decision, the chain is told so rather
    /// than quietly edited -- otherwise the ledger would disagree with our own database
    /// with no record of which side changed.
    event Adjusted(address indexed learner, int256 delta, uint256 balance, bytes32 indexed ref, string note);

    error NotOwner();
    error AlreadyCredited(bytes32 ref);
    error UnknownLearner();
    error InsufficientBalance();
    error NothingToDo();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _owner) {
        owner = _owner;
    }

    /**
     * Credit an award. Idempotent on `ref`, which is the PointsEvent id -- and that model
     * already carries a unique constraint on (userId, ref), so the database and the chain
     * enforce the same rule independently. Either catching the other is enough; having
     * both is why a retried job, a replayed webhook and a duplicated queue message all
     * leave the learner with exactly the points they earned.
     */
    function credit(address learner, uint256 amount, uint8 reason, bytes32 ref) external onlyOwner {
        if (learner == address(0)) revert UnknownLearner();
        if (amount == 0) revert NothingToDo();
        if (seen[ref]) revert AlreadyCredited(ref);
        seen[ref] = true;
        uint256 bal = balances[learner] + amount;
        balances[learner] = bal;
        emit Credited(learner, amount, bal, reason, ref);
    }

    /**
     * Spend points. Only inside the platform -- this is what a course unlock or a discount
     * calls. It is not a transfer: the points do not move to a third party, they are
     * consumed, and the balance is the record of what has been used up.
     */
    function debit(address learner, uint256 amount, bytes32 reason) external onlyOwner {
        if (learner == address(0)) revert UnknownLearner();
        if (amount == 0) revert NothingToDo();
        uint256 bal = balances[learner];
        if (bal < amount) revert InsufficientBalance();
        bal -= amount;
        balances[learner] = bal;
        emit Debited(learner, amount, bal, reason);
    }

    /**
     * Move a balance without an award or a spend behind it. Used when we have to correct
     * our own arithmetic -- a points rule changed retrospectively, a day was wrongly
     * marked attended, a manual adjustment was entered against the wrong learner.
     *
     * Recorded as its own event with a note rather than as a credit or debit, because
     * pretending a correction was an award would make the ledger lie about how the balance
     * got there, and that history is the part anyone relying on it will care about.
     */
    function adjust(address learner, int256 delta, bytes32 ref, string calldata note) external onlyOwner {
        if (learner == address(0)) revert UnknownLearner();
        if (delta == 0) revert NothingToDo();
        if (delta < 0) {
            uint256 bal = balances[learner];
            uint256 amount = uint256(-delta);
            if (bal < amount) revert InsufficientBalance();
            balances[learner] = bal - amount;
            emit Adjusted(learner, delta, balances[learner], ref, note);
        } else {
            uint256 bal = balances[learner] + uint256(delta);
            balances[learner] = bal;
            emit Adjusted(learner, delta, bal, ref, note);
        }
    }

    function balanceOf(address learner) external view returns (uint256) {
        return balances[learner];
    }

    function wasCredited(bytes32 ref) external view returns (bool) {
        return seen[ref];
    }
}
