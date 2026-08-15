// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ChainBridgeIdentityRegistry} from "../src/ChainBridgeIdentityRegistry.sol";

/**
 * @notice Deploys ChainBridgeIdentityRegistry. ADR-005 stage 2 ships the same
 *         bytecode to both Base Sepolia and Sepolia.
 *
 * Usage (Base Sepolia):
 *   forge script script/DeployIdentityRegistry.s.sol \
 *     --rpc-url base_sepolia --broadcast --verify -vvvv
 *
 * Reads PRIVATE_KEY from the environment (a fresh test key — never one holding
 * real funds).
 */
contract DeployIdentityRegistry is Script {
    function run() external returns (ChainBridgeIdentityRegistry registry) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        registry = new ChainBridgeIdentityRegistry();
        vm.stopBroadcast();

        console.log("ChainBridgeIdentityRegistry deployed at:", address(registry));
        console.log("Chain id:", block.chainid);
    }
}
