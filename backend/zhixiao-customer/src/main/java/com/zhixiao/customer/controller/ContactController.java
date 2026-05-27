package com.zhixiao.customer.controller;

import com.zhixiao.common.response.Result;
import com.zhixiao.customer.entity.Contact;
import com.zhixiao.customer.service.CustomerService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Contact controller
 */
@RestController
@RequestMapping("/api/contacts")
public class ContactController {

    @Autowired
    private CustomerService customerService;

    @GetMapping("/customer/{customerId}")
    public Result<List<Contact>> getContactsByCustomer(@PathVariable Long customerId) {
        return Result.success(customerService.findContactsByCustomerId(customerId));
    }

    @PostMapping
    public Result<Contact> createContact(@RequestBody Contact contact) {
        return Result.created(customerService.createContact(contact));
    }

    @PutMapping("/{id}")
    public Result<Contact> updateContact(@PathVariable Long id, @RequestBody Contact contact) {
        return Result.success(customerService.updateContact(id, contact));
    }

    @DeleteMapping("/{id}")
    public Result<Void> deleteContact(@PathVariable Long id) {
        customerService.deleteContact(id);
        return Result.success();
    }
}
