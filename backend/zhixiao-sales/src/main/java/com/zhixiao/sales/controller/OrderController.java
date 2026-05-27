package com.zhixiao.sales.controller;

import com.zhixiao.common.response.PageResult;
import com.zhixiao.common.response.Result;
import com.zhixiao.sales.entity.Order;
import com.zhixiao.sales.service.SalesService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.*;

/**
 * Order controller
 */
@RestController
@RequestMapping("/api/orders")
public class OrderController {

    @Autowired
    private SalesService salesService;

    @GetMapping
    public PageResult<Order> listOrders(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int pageSize) {
        Page<Order> orderPage = salesService.listOrders(1L, PageRequest.of(page - 1, pageSize));
        return PageResult.success(orderPage.getContent(), orderPage.getTotalElements(), page, pageSize);
    }

    @GetMapping("/{id}")
    public Result<Order> getOrder(@PathVariable Long id) {
        return Result.success(salesService.findOrderById(id));
    }

    @PostMapping
    public Result<Order> createOrder(@RequestBody Order order) {
        return Result.created(salesService.createOrder(order));
    }

    @PutMapping("/{id}")
    public Result<Order> updateOrder(@PathVariable Long id, @RequestBody Order order) {
        return Result.success(salesService.updateOrder(id, order));
    }

    @DeleteMapping("/{id}")
    public Result<Void> deleteOrder(@PathVariable Long id) {
        salesService.deleteOrder(id);
        return Result.success();
    }
}
