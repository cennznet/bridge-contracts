// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract WrappedCENNZ is ERC20 {
    // CENNZnet erc20 peg address
    address public pegAddress;

    constructor(address _pegAddress) ERC20("Wrapped CENNZ", "WCENNZ") {
        pegAddress = _pegAddress;
    }

    function transferFrom(address owner, address buyer, uint256 numTokens) public override returns (bool) {
        if (msg.sender == pegAddress) {
            _burn(owner, numTokens);
            return true;
        }
        return super.transferFrom(owner, buyer, numTokens);
    }

    function transfer(address buyer, uint256 numTokens) public override returns (bool) {
        if (msg.sender == pegAddress) {
            _mint(buyer, numTokens);
            return true;
        }
        return super.transfer(buyer, numTokens);
    }

    function decimals() public pure override returns (uint8) {
        return 4;
    }
}
