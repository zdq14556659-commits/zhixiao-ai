package com.zhixiao.customer.service;

import com.zhixiao.common.exception.BusinessException;
import com.zhixiao.customer.entity.Clue;
import com.zhixiao.customer.entity.Communication;
import com.zhixiao.customer.entity.Contact;
import com.zhixiao.customer.entity.Customer;
import com.zhixiao.customer.repository.ClueRepository;
import com.zhixiao.customer.repository.ContactRepository;
import com.zhixiao.customer.repository.CustomerRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

/**
 * Customer service
 */
@Service
public class CustomerService {

    @Autowired
    private CustomerRepository customerRepository;

    @Autowired
    private ContactRepository contactRepository;

    @Autowired
    private ClueRepository clueRepository;

    @PersistenceContext
    private EntityManager entityManager;

    // ===== Customer CRUD =====

    public Customer findById(Long id) {
        return customerRepository.findById(id)
                .orElseThrow(() -> new BusinessException("Customer not found: " + id));
    }

    public Page<Customer> listByCompany(Long companyId, Pageable pageable) {
        return customerRepository.findByCompanyIdAndIsDeleted(companyId, 0, pageable);
    }

    @Transactional
    public Customer create(Customer customer) {
        return customerRepository.save(customer);
    }

    @Transactional
    public Customer update(Long id, Customer updated) {
        Customer customer = findById(id);
        if (updated.getName() != null) customer.setName(updated.getName());
        if (updated.getIndustry() != null) customer.setIndustry(updated.getIndustry());
        if (updated.getSource() != null) customer.setSource(updated.getSource());
        if (updated.getPhone() != null) customer.setPhone(updated.getPhone());
        if (updated.getAddress() != null) customer.setAddress(updated.getAddress());
        if (updated.getWebsite() != null) customer.setWebsite(updated.getWebsite());
        if (updated.getStage() != null) customer.setStage(updated.getStage());
        if (updated.getTags() != null) customer.setTags(updated.getTags());
        if (updated.getIntentionLevel() != null) customer.setIntentionLevel(updated.getIntentionLevel());
        if (updated.getEstimatedAmount() != null) customer.setEstimatedAmount(updated.getEstimatedAmount());
        if (updated.getNextContactAt() != null) customer.setNextContactAt(updated.getNextContactAt());
        if (updated.getRemark() != null) customer.setRemark(updated.getRemark());
        if (updated.getOwnerId() != null) customer.setOwnerId(updated.getOwnerId());
        return customerRepository.save(customer);
    }

    @Transactional
    public void delete(Long id) {
        Customer customer = findById(id);
        customer.setIsDeleted(1);
        customerRepository.save(customer);
    }

    // ===== Contact CRUD =====

    public List<Contact> findContactsByCustomerId(Long customerId) {
        return contactRepository.findByCustomerIdAndIsDeleted(customerId, 0);
    }

    @Transactional
    public Contact createContact(Contact contact) {
        return contactRepository.save(contact);
    }

    @Transactional
    public Contact updateContact(Long id, Contact updated) {
        Contact contact = contactRepository.findById(id)
                .orElseThrow(() -> new BusinessException("Contact not found: " + id));
        if (updated.getName() != null) contact.setName(updated.getName());
        if (updated.getPhone() != null) contact.setPhone(updated.getPhone());
        if (updated.getPosition() != null) contact.setPosition(updated.getPosition());
        if (updated.getIsDecisionMaker() != null) contact.setIsDecisionMaker(updated.getIsDecisionMaker());
        if (updated.getWechatId() != null) contact.setWechatId(updated.getWechatId());
        if (updated.getEmail() != null) contact.setEmail(updated.getEmail());
        if (updated.getRemark() != null) contact.setRemark(updated.getRemark());
        return contactRepository.save(contact);
    }

    @Transactional
    public void deleteContact(Long id) {
        Contact contact = contactRepository.findById(id)
                .orElseThrow(() -> new BusinessException("Contact not found: " + id));
        contact.setIsDeleted(1);
        contactRepository.save(contact);
    }

    // ===== Clue CRUD =====

    public Clue findClueById(Long id) {
        return clueRepository.findById(id)
                .orElseThrow(() -> new BusinessException("Clue not found: " + id));
    }

    public Page<Clue> listCluesByCompany(Long companyId, Pageable pageable) {
        return clueRepository.findByCompanyIdAndIsDeleted(companyId, 0, pageable);
    }

    @Transactional
    public Clue createClue(Clue clue) {
        return clueRepository.save(clue);
    }

    @Transactional
    public Clue updateClue(Long id, Clue updated) {
        Clue clue = clueRepository.findById(id)
                .orElseThrow(() -> new BusinessException("Clue not found: " + id));
        if (updated.getCustomerName() != null) clue.setCustomerName(updated.getCustomerName());
        if (updated.getContactName() != null) clue.setContactName(updated.getContactName());
        if (updated.getContactPhone() != null) clue.setContactPhone(updated.getContactPhone());
        if (updated.getSource() != null) clue.setSource(updated.getSource());
        if (updated.getIndustry() != null) clue.setIndustry(updated.getIndustry());
        if (updated.getDescription() != null) clue.setDescription(updated.getDescription());
        if (updated.getStatus() != null) clue.setStatus(updated.getStatus());
        if (updated.getOwnerId() != null) clue.setOwnerId(updated.getOwnerId());
        return clueRepository.save(clue);
    }

    @Transactional
    public void deleteClue(Long id) {
        Clue clue = clueRepository.findById(id)
                .orElseThrow(() -> new BusinessException("Clue not found: " + id));
        clue.setIsDeleted(1);
        clueRepository.save(clue);
    }

    // ===== 360 Customer Detail =====

    /**
     * Get customer 360 view with related data from other modules
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> getCustomerDetail(Long customerId) {
        Customer customer = findById(customerId);
        List<Contact> contacts = findContactsByCustomerId(customerId);

        // Get communications
        List<Communication> communications = entityManager.createNativeQuery(
                "SELECT * FROM crm_communication WHERE customer_id = :customerId ORDER BY created_at DESC",
                Communication.class)
                .setParameter("customerId", customerId)
                .getResultList();

        // Get opportunities
        List<Object[]> opportunities = entityManager.createNativeQuery(
                "SELECT id, name, stage, amount, probability FROM crm_opportunity WHERE customer_id = :customerId AND is_deleted = 0")
                .setParameter("customerId", customerId)
                .getResultList();

        // Get orders
        List<Object[]> orders = entityManager.createNativeQuery(
                "SELECT id, order_no, amount, status FROM crm_order WHERE customer_id = :customerId AND is_deleted = 0")
                .setParameter("customerId", customerId)
                .getResultList();

        // Get recordings
        List<Object[]> recordings = entityManager.createNativeQuery(
                "SELECT id, file_name, duration, transcribe_status FROM rec_recording WHERE customer_id = :customerId AND is_deleted = 0")
                .setParameter("customerId", customerId)
                .getResultList();

        Map<String, Object> result = new java.util.HashMap<>();
        result.put("customer", customer);
        result.put("contacts", contacts);
        result.put("communications", communications);
        result.put("opportunities", opportunities);
        result.put("orders", orders);
        result.put("recordings", recordings);
        return result;
    }
}
