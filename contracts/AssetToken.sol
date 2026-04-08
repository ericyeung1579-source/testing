// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

contract AssetToken is IERC20 {
    string public name = "Asset Token";
    string public symbol = "ASSET";
    uint8 public decimals = 18;
    
    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;
    
    address public registry;
    address public owner;
    
    event Minted(address indexed to, uint256 amount);
    event Burned(address indexed from, uint256 amount);
    
    modifier onlyRegistry() {
        require(msg.sender == registry, "Only registry can mint");
        _;
    }
    
    constructor(address _registry) {
        owner = msg.sender;
        registry = _registry;
    }

    function setRegistry(address _registry) external {
        require(msg.sender == owner, "Only owner can set registry");
        require(_registry != address(0), "Invalid registry address");
        require(registry == address(0), "Registry already set");
        registry = _registry;
    }
    
    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }
    
    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }
    
    function transfer(address to, uint256 amount) external returns (bool) {
        require(to != address(0), "Cannot transfer to zero address");
        require(_balances[msg.sender] >= amount, "Insufficient balance");
        
        _balances[msg.sender] -= amount;
        _balances[to] += amount;
        
        emit Transfer(msg.sender, to, amount);
        return true;
    }
    
    function allowance(address account, address spender) external view returns (uint256) {
        return _allowances[account][spender];
    }
    
    function approve(address spender, uint256 amount) external returns (bool) {
        _allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
    
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(to != address(0), "Cannot transfer to zero address");
        require(_balances[from] >= amount, "Insufficient balance");
        require(_allowances[from][msg.sender] >= amount, "Allowance exceeded");
        
        _balances[from] -= amount;
        _balances[to] += amount;
        _allowances[from][msg.sender] -= amount;
        
        emit Transfer(from, to, amount);
        return true;
    }
    
    function mint(address to, uint256 amount) external onlyRegistry {
        require(to != address(0), "Cannot mint to zero address");
        
        _balances[to] += amount;
        _totalSupply += amount;
        
        emit Minted(to, amount);
        emit Transfer(address(0), to, amount);
    }
    
    function burn(address from, uint256 amount) external onlyRegistry {
        require(_balances[from] >= amount, "Insufficient balance to burn");
        
        _balances[from] -= amount;
        _totalSupply -= amount;
        
        emit Burned(from, amount);
        emit Transfer(from, address(0), amount);
    }
}
