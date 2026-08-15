// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ChainBridgeIdentityRegistry} from "../src/ChainBridgeIdentityRegistry.sol";

contract ChainBridgeIdentityRegistryTest is Test {
    ChainBridgeIdentityRegistry internal registry;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    event AgentRegistered(bytes32 indexed agentId, address indexed controller, string endpoint);
    event AgentUpdated(bytes32 indexed agentId, address indexed controller);
    event ControllerTransferred(bytes32 indexed agentId, address indexed from, address indexed to);

    function setUp() public {
        registry = new ChainBridgeIdentityRegistry();
    }

    function _caps() internal pure returns (string[] memory caps) {
        caps = new string[](2);
        caps[0] = "web-search";
        caps[1] = "summarize";
    }

    function test_register_returnsExpectedId_andStores() public {
        bytes32 expected = registry.computeAgentId(alice, 0);

        vm.expectEmit(true, true, false, true);
        emit AgentRegistered(expected, alice, "http://alice.local");

        vm.prank(alice);
        bytes32 id = registry.register("ResearchBot", _caps(), "http://alice.local");

        assertEq(id, expected);
        assertTrue(registry.isRegistered(id));
        assertEq(registry.controllerOf(id), alice);
        assertEq(registry.registrationCount(alice), 1);

        ChainBridgeIdentityRegistry.AgentInfo memory info = registry.resolve(id);
        assertEq(info.controller, alice);
        assertEq(info.name, "ResearchBot");
        assertEq(info.endpoint, "http://alice.local");
        assertEq(info.capabilities.length, 2);
        assertEq(info.capabilities[0], "web-search");
        assertEq(info.registeredAt, block.timestamp);
    }

    function test_register_sameControllerTwice_givesDistinctIds() public {
        vm.startPrank(alice);
        bytes32 id0 = registry.register("A", _caps(), "e0");
        bytes32 id1 = registry.register("B", _caps(), "e1");
        vm.stopPrank();

        assertTrue(id0 != id1);
        assertEq(id0, registry.computeAgentId(alice, 0));
        assertEq(id1, registry.computeAgentId(alice, 1));
        assertEq(registry.registrationCount(alice), 2);
    }

    function test_register_differentControllers_noCollisionAtSameNonce() public {
        vm.prank(alice);
        bytes32 aId = registry.register("A", _caps(), "ea");
        vm.prank(bob);
        bytes32 bId = registry.register("B", _caps(), "eb");
        assertTrue(aId != bId);
    }

    function test_resolve_unknown_reverts() public {
        bytes32 ghost = keccak256("nope");
        vm.expectRevert(
            abi.encodeWithSelector(ChainBridgeIdentityRegistry.AgentNotFound.selector, ghost)
        );
        registry.resolve(ghost);
    }

    function test_update_byController_mutatesMetadata() public {
        vm.prank(alice);
        bytes32 id = registry.register("Old", _caps(), "old");

        string[] memory newCaps = new string[](1);
        newCaps[0] = "translate";

        vm.expectEmit(true, true, false, false);
        emit AgentUpdated(id, alice);

        vm.prank(alice);
        registry.update(id, "New", newCaps, "new");

        ChainBridgeIdentityRegistry.AgentInfo memory info = registry.resolve(id);
        assertEq(info.name, "New");
        assertEq(info.endpoint, "new");
        assertEq(info.capabilities.length, 1);
        assertEq(info.capabilities[0], "translate");
        // controller + registeredAt unchanged
        assertEq(info.controller, alice);
    }

    function test_update_byNonController_reverts() public {
        vm.prank(alice);
        bytes32 id = registry.register("Old", _caps(), "old");

        vm.expectRevert(
            abi.encodeWithSelector(ChainBridgeIdentityRegistry.NotController.selector, id, bob)
        );
        vm.prank(bob);
        registry.update(id, "Hijacked", _caps(), "evil");
    }

    function test_transferController_movesControl() public {
        vm.prank(alice);
        bytes32 id = registry.register("A", _caps(), "ea");

        vm.expectEmit(true, true, true, false);
        emit ControllerTransferred(id, alice, bob);
        vm.prank(alice);
        registry.transferController(id, bob);

        assertEq(registry.controllerOf(id), bob);

        // Old controller can no longer update.
        vm.expectRevert(
            abi.encodeWithSelector(ChainBridgeIdentityRegistry.NotController.selector, id, alice)
        );
        vm.prank(alice);
        registry.update(id, "x", _caps(), "x");

        // New controller can.
        vm.prank(bob);
        registry.update(id, "owned-by-bob", _caps(), "eb");
        assertEq(registry.resolve(id).name, "owned-by-bob");
    }

    function test_transferController_toZero_reverts() public {
        vm.prank(alice);
        bytes32 id = registry.register("A", _caps(), "ea");
        vm.expectRevert(ChainBridgeIdentityRegistry.ZeroAddressController.selector);
        vm.prank(alice);
        registry.transferController(id, address(0));
    }

    function testFuzz_computeAgentId_matchesRegistration(address who, uint8 times) public {
        vm.assume(who != address(0));
        times = uint8(bound(times, 1, 5));
        vm.startPrank(who);
        for (uint256 i = 0; i < times; i++) {
            bytes32 id = registry.register("a", _caps(), "e");
            assertEq(id, registry.computeAgentId(who, i));
        }
        vm.stopPrank();
        assertEq(registry.registrationCount(who), times);
    }
}
