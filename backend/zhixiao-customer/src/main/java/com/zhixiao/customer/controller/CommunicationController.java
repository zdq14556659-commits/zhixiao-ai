package com.zhixiao.customer.controller;

import com.zhixiao.common.response.Result;
import com.zhixiao.customer.entity.Communication;
import com.zhixiao.customer.repository.CommunicationRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Communication controller
 */
@RestController
@RequestMapping("/api/communications")
public class CommunicationController {

    @Autowired
    private CommunicationRepository communicationRepository;

    @GetMapping("/customer/{customerId}")
    public Result<List<Communication>> getCommunications(@PathVariable Long customerId) {
        return Result.success(communicationRepository.findByCustomerIdOrderByCreatedAtDesc(customerId));
    }

    @PostMapping
    public Result<Communication> createCommunication(@RequestBody Communication communication) {
        return Result.created(communicationRepository.save(communication));
    }
}
