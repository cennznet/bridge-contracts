// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract WrappedCENNZ is ERC20 {
    // CENNZ ERC20 contract address
    address public pegAddress;

    constructor(address _pegAddress) ERC20("Wrapped CENNZ", "WCENNZ") {
        pegAddress = _pegAddress;
    }

    function transferFrom(address owner, address buyer, uint256 numTokens) public override returns (bool) {
        require(msg.sender == pegAddress);
        require(owner != buyer);
        require(buyer == pegAddress);

        _burn(owner, numTokens);

        return true;
    }

    function transfer(address buyer, uint256 numTokens) public override returns (bool) {
        require(msg.sender == pegAddress);
        _mint(buyer, numTokens);

        return true;
    }
}
