// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestToken2 is ERC20 {
    constructor(uint256 initialSupply) ERC20("Test Token2", "TT2") {
        _mint(msg.sender, initialSupply);
    }
}
