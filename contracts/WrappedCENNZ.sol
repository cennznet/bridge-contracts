// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract WrappedCENNZ is ERC20 {
    // CENNZ ERC20 contract address
    address public pegAddress;
    mapping(address => mapping(address => uint256)) private _allowances;


    constructor(address _pegAddress) ERC20("Wrapped CENNZ", "WCENNZ") {
        pegAddress = _pegAddress;
    }

    function transferFrom(address owner, address buyer, uint256 numTokens) public override returns (bool) {
        if (msg.sender == pegAddress) {
            _burn(owner, numTokens);
        } else {
            super.transferFrom(owner, buyer, numTokens);
        }
        return true;
    }

    function transfer(address buyer, uint256 numTokens) public override returns (bool) {
        if (msg.sender == pegAddress) {
            _mint(buyer, numTokens);
        } else {
            _transfer(msg.sender, buyer, numTokens);
        }
        return true;
    }
}
