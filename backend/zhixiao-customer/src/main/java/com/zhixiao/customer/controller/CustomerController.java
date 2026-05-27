package com.zhixiao.customer.controller;

import com.zhixiao.common.response.PageResult;
import com.zhixiao.common.response.Result;
import com.zhixiao.customer.entity.Customer;
import com.zhixiao.customer.service.CustomerService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Customer controller
 */
@RestController
@RequestMapping("/api/customers")
public class CustomerController {

    @Autowired
    private CustomerService customerService;

    @GetMapping
    public PageResult<Customer> listCustomers(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int pageSize,
            @RequestAttribute("userId") Long userId) {
        Page<Customer> customerPage = customerService.listByCompany(1L, PageRequest.of(page - 1, pageSize));
        return PageResult.success(customerPage.getContent(), customerPage.getTotalElements(), page, pageSize);
    }

    @GetMapping("/{id}")
    public Result<Customer> getCustomer(@PathVariable Long id) {
        return Result.success(customerService.findById(id));
    }

    @GetMapping("/{id}/detail")
    public Result<Map<String, Object>> getCustomerDetail(@PathVariable Long id) {
        return Result.success(customerService.getCustomerDetail(id));
    }

    @PostMapping
    public Result<Customer> createCustomer(@RequestBody Customer customer, @RequestAttribute("userId") Long userId) {
        customer.setOwnerId(userId);
        return Result.created(customerService.create(customer));
    }

    @PutMapping("/{id}")
    public Result<Customer> updateCustomer(@PathVariable Long id, @RequestBody Customer customer) {
        return Result.success(customerService.update(id, customer));
    }

    @DeleteMapping("/{id}")
    public Result<Void> deleteCustomer(@PathVariable Long id) {
        customerService.delete(id);
        return Result.success();
    }
}
