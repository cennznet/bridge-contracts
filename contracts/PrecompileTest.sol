// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


contract PrecompileTest {
    function doSomething(address who, address token, uint256 amount) external {
       IERC20(token).transfer(who, amount);
    }
}