// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title ChainBridgeIdentityRegistry
 * @notice Minimal on-chain Identity Registry for autonomous agents, in the
 *         shape of ERC-8004's identity layer.
 *
 * @dev Implements ADR-005 stage 2: deploy our own minimal registry rather than
 *      wait for a canonical ERC-8004 deployment. Intentionally tiny — no
 *      reputation, no validation, no permissions beyond "the controller owns its
 *      record". Those are separate concerns (Module D). The `AgentInfo` shape
 *      matches the spike's mock (spike/run.ts) so the SDK swaps the backing
 *      store for this contract behind a stable `identity.*` interface with no
 *      shape change.
 *
 *      Identifier format (resolves friction-log "Identifier format" open item):
 *      `agentId = keccak256(abi.encode(controller, nonce))`, where `nonce` is a
 *      per-controller counter. Chosen over the spike's
 *      `keccak256(controller, block.timestamp)` because timestamps collide
 *      (two registrations in one block) and over a global sequential uint256
 *      because a content-addressed id leaks no global supply and lets one
 *      controller deterministically own multiple agents.
 */
contract ChainBridgeIdentityRegistry {
    struct AgentInfo {
        address controller;
        string name;
        string[] capabilities;
        string endpoint;
        uint256 registeredAt;
    }

    /// @dev agentId => record. A zero `registeredAt` means "not registered".
    mapping(bytes32 => AgentInfo) private _agents;

    /// @dev controller => number of agents it has registered (the next nonce).
    mapping(address => uint256) public registrationCount;

    event AgentRegistered(bytes32 indexed agentId, address indexed controller, string endpoint);
    event AgentUpdated(bytes32 indexed agentId, address indexed controller);
    event ControllerTransferred(bytes32 indexed agentId, address indexed from, address indexed to);

    error AgentNotFound(bytes32 agentId);
    error NotController(bytes32 agentId, address caller);
    error ZeroAddressController();

    /**
     * @notice Register a new agent controlled by the caller.
     * @return agentId The content-addressed id for the new agent.
     */
    function register(
        string calldata name,
        string[] calldata capabilities,
        string calldata endpoint
    ) external returns (bytes32 agentId) {
        uint256 nonce = registrationCount[msg.sender];
        agentId = keccak256(abi.encode(msg.sender, nonce));
        registrationCount[msg.sender] = nonce + 1;

        _agents[agentId] = AgentInfo({
            controller: msg.sender,
            name: name,
            capabilities: capabilities,
            endpoint: endpoint,
            registeredAt: block.timestamp
        });

        emit AgentRegistered(agentId, msg.sender, endpoint);
    }

    /**
     * @notice Resolve an agent's full record.
     * @dev Reverts if the agent does not exist, so callers never silently read a
     *      zeroed struct.
     */
    function resolve(bytes32 agentId) external view returns (AgentInfo memory) {
        AgentInfo memory info = _agents[agentId];
        if (info.registeredAt == 0) revert AgentNotFound(agentId);
        return info;
    }

    /// @notice True if `agentId` has been registered.
    function isRegistered(bytes32 agentId) external view returns (bool) {
        return _agents[agentId].registeredAt != 0;
    }

    /// @notice The controller of an agent (reverts if unknown).
    function controllerOf(bytes32 agentId) external view returns (address) {
        AgentInfo storage info = _agents[agentId];
        if (info.registeredAt == 0) revert AgentNotFound(agentId);
        return info.controller;
    }

    /**
     * @notice Update an agent's mutable metadata. Controller-only.
     * @dev `controller` and `registeredAt` are immutable here; transfer of
     *      control goes through {transferController}.
     */
    function update(
        bytes32 agentId,
        string calldata name,
        string[] calldata capabilities,
        string calldata endpoint
    ) external {
        AgentInfo storage info = _agents[agentId];
        if (info.registeredAt == 0) revert AgentNotFound(agentId);
        if (info.controller != msg.sender) revert NotController(agentId, msg.sender);

        info.name = name;
        info.capabilities = capabilities;
        info.endpoint = endpoint;

        emit AgentUpdated(agentId, msg.sender);
    }

    /**
     * @notice Hand control of an agent to a new address. Controller-only.
     */
    function transferController(bytes32 agentId, address newController) external {
        if (newController == address(0)) revert ZeroAddressController();
        AgentInfo storage info = _agents[agentId];
        if (info.registeredAt == 0) revert AgentNotFound(agentId);
        if (info.controller != msg.sender) revert NotController(agentId, msg.sender);

        info.controller = newController;
        emit ControllerTransferred(agentId, msg.sender, newController);
    }

    /**
     * @notice Pure helper to compute the agentId a controller will get for a
     *         given nonce. Lets clients precompute ids before registering.
     */
    function computeAgentId(address controller, uint256 nonce) external pure returns (bytes32) {
        return keccak256(abi.encode(controller, nonce));
    }
}
